import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { FibeSyncSettingsStoreService } from './fibe-sync-settings-store.service';
import {
  FIBE_API_BODY_LIMIT_BYTES,
  parseSyncItems,
  planSyncBatches,
  syncBody,
  syncPaceMs,
  type SyncBatch,
} from './fibe-sync-batches';

type SyncType = 'messages' | 'activity' | 'provider_traffic';
type PutOutcome = 'ok' | 'unauthorized' | 'refused' | 'failed';

interface PendingSync {
  type: SyncType;
  conversationId: string;
  getContent: () => string;
  timer: ReturnType<typeof setTimeout> | null;
  syncing: boolean;
  version: number;
  retryCount: number;
}

interface SyncResult {
  /** done: nothing to retry for this content; retry: back off and resume. */
  status: 'done' | 'retry';
  /** Body bytes of every request the flush made; paces the next flush. */
  bytes: number;
}

/** The version of an item the API accepted or refused. */
interface SyncedItem {
  digest: string;
  /** Oversized item an older API refused: offered again from this time on. */
  retryAt?: number;
}

@Injectable()
export class FibeSyncService {
  private readonly logger = new Logger(FibeSyncService.name);
  private stopped = false;
  private readonly requests = new Set<AbortController>();
  private static readonly REQUEST_TIMEOUT_MS = 30_000;
  private readonly pendingSyncs = new Map<string, PendingSync>();
  /**
   * Per type and conversation: item id -> the version the API accepted (or
   * refused). Only new or changed items are sent again. Process memory only,
   * so the first sync after a restart sends everything.
   */
  private readonly synced = new Map<string, Map<string, SyncedItem>>();
  /** Per type and conversation: earliest Date.now() for the next flush. */
  private readonly notBefore = new Map<string, number>();
  private static readonly DEBOUNCE_MS = 500;
  private static readonly RETRY_INITIAL_MS = 1000;
  private static readonly RETRY_MAX_MS = 30_000;
  /** How often an oversized item refused by an older Fibe API is offered again. */
  private static readonly OVERSIZED_RETRY_MS = 10 * 60_000;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly settingsStore?: FibeSyncSettingsStoreService,
  ) {}

  syncMessages(getContent: () => string, conversationId?: string): void {
    this.scheduleSync('messages', getContent, conversationId);
  }

  syncActivity(getContent: () => string, conversationId?: string): void {
    this.scheduleSync('activity', getContent, conversationId);
  }

  syncRawProviders(getContent: () => string, conversationId?: string): void {
    this.scheduleSync('provider_traffic', getContent, conversationId);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    for (const pending of this.pendingSyncs.values()) {
      if (pending.timer) clearTimeout(pending.timer);
    }
    this.pendingSyncs.clear();
    this.synced.clear();
    this.notBefore.clear();
  }

  private scheduleSync(
    type: SyncType,
    getContent: () => string,
    conversationId?: string,
  ): void {
    if (this.stopped || !this.syncTarget(type)) return;

    const normalizedConversationId = conversationId || 'default';
    const key = this.syncKey(type, normalizedConversationId);
    let pending = this.pendingSyncs.get(key);
    if (!pending) {
      pending = {
        type,
        conversationId: normalizedConversationId,
        getContent,
        timer: null,
        syncing: false,
        version: 0,
        retryCount: 0,
      };
      this.pendingSyncs.set(key, pending);
    }

    pending.getContent = getContent;
    pending.version += 1;
    pending.retryCount = 0;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = null;

    if (!pending.syncing) {
      this.scheduleFlush(key, pending, FibeSyncService.DEBOUNCE_MS);
    }
  }

  private async flushPendingSync(key: string): Promise<void> {
    const pending = this.pendingSyncs.get(key);
    if (this.stopped || !pending || pending.syncing) return;

    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = null;
    pending.syncing = true;
    const version = pending.version;

    let content: string;
    try {
      content = pending.getContent();
    } catch (err) {
      this.logger.error(
        `Error resolving ${pending.type} content for sync: ${err}`,
      );
      this.pendingSyncs.delete(key);
      return;
    }

    const result = await this.sync(
      pending.type,
      content,
      pending.conversationId,
    );
    const current = this.pendingSyncs.get(key);
    if (!current) return;

    current.syncing = false;
    if (result.bytes > 0) {
      this.notBefore.set(key, Date.now() + syncPaceMs(result.bytes));
    }
    if (result.status === 'retry') {
      this.scheduleRetry(key, current);
      return;
    }
    if (current.version !== version) {
      this.scheduleFlush(key, current, FibeSyncService.DEBOUNCE_MS);
      return;
    }
    const retryAt = this.nextOversizedRetry(key);
    if (retryAt === undefined) {
      this.pendingSyncs.delete(key);
      return;
    }
    // Offer the refused oversized item again even if nothing changes locally,
    // so it lands once the Fibe API accepts larger bodies.
    this.scheduleFlush(key, current, retryAt - Date.now());
  }

  private scheduleRetry(key: string, pending: PendingSync): void {
    const delay = Math.min(
      FibeSyncService.RETRY_MAX_MS,
      FibeSyncService.RETRY_INITIAL_MS * 2 ** Math.min(pending.retryCount, 5),
    );
    pending.retryCount += 1;
    this.scheduleFlush(key, pending, delay);
  }

  /** Waits at least `minimumMs`, and never starts before the key's pacing allows. */
  private scheduleFlush(
    key: string,
    pending: PendingSync,
    minimumMs: number,
  ): void {
    const now = Date.now();
    const notBefore = this.notBefore.get(key) ?? 0;
    if (notBefore <= now) this.notBefore.delete(key);
    const delay = Math.max(0, minimumMs, notBefore - now);
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => void this.flushPendingSync(key), delay);
  }

  private nextOversizedRetry(key: string): number | undefined {
    let next: number | undefined;
    for (const item of this.synced.get(key)?.values() ?? []) {
      if (
        item.retryAt !== undefined &&
        (next === undefined || item.retryAt < next)
      ) {
        next = item.retryAt;
      }
    }
    return next;
  }

  /**
   * A JSON array is sent as the items not yet synced: packed into requests
   * within the budget, an oversized item alone and unchanged. Any other
   * content is sent verbatim in one request.
   */
  private async sync(
    type: SyncType,
    content: string,
    conversationId: string,
  ): Promise<SyncResult> {
    const target = this.syncTarget(type);
    if (!target) return { status: 'done', bytes: 0 };
    const { apiUrl, apiKey, agentId } = target;
    const url = `${apiUrl}/api/agents/${agentId}/${type}`;

    const items = parseSyncItems(content);
    if (!items) {
      const body = JSON.stringify({ content, conversation_id: conversationId });
      const bytes = Buffer.byteLength(body);
      const { outcome, detail } = await this.put(type, url, apiKey, body);
      if (outcome === 'refused') {
        this.logger.warn(
          `Fibe sync ${type} refused: ${detail} (non-array content, ${bytes} bytes); not retried until it changes`,
        );
      }
      return { status: outcome === 'failed' ? 'retry' : 'done', bytes };
    }

    const key = this.syncKey(type, conversationId);
    let synced = this.synced.get(key);
    if (!synced) {
      synced = new Map();
      this.synced.set(key, synced);
    }
    const known = synced;
    const now = Date.now();
    const plan = planSyncBatches(items, conversationId, (id, digest) => {
      const item = known.get(id);
      return (
        item !== undefined &&
        item.digest === digest &&
        (item.retryAt === undefined || item.retryAt > now)
      );
    });
    // Nothing is deleted remotely; forgetting vanished ids only bounds memory.
    for (const id of known.keys()) {
      if (!plan.presentIds.has(id)) known.delete(id);
    }
    if (plan.refusedIds > 0) {
      this.logger.warn(
        `Fibe sync ${type} skipped ${plan.refusedIds} item(s) whose id the Fibe API refuses (conversation ${conversationId})`,
      );
    }

    let bytes = 0;
    try {
      for (const batch of plan.batches) {
        if (this.stopped) return { status: 'retry', bytes };
        bytes += batch.bytes;
        const { outcome, detail } = await this.put(
          type,
          url,
          apiKey,
          syncBody(batch.parts, conversationId),
        );
        if (outcome === 'unauthorized') return { status: 'done', bytes };
        if (outcome === 'failed') return { status: 'retry', bytes };
        const retryAt =
          outcome === 'refused'
            ? this.recordRefusal(type, conversationId, batch, detail)
            : undefined;
        for (const entry of batch.entries) {
          known.set(entry.id, { digest: entry.digest, retryAt });
        }
      }
      return { status: 'done', bytes };
    } finally {
      if (known.size === 0 && this.synced.get(key) === known) {
        this.synced.delete(key);
      }
    }
  }

  /**
   * Logs a 413/422. One oversized item was most likely refused by an older
   * Fibe API's 1 MiB body limit: it is offered again when it changes or after
   * OVERSIZED_RETRY_MS (returned). Other refused items wait for a change.
   */
  private recordRefusal(
    type: SyncType,
    conversationId: string,
    batch: SyncBatch,
    detail: string,
  ): number | undefined {
    if (batch.entries.length === 1 && batch.bytes > FIBE_API_BODY_LIMIT_BYTES) {
      this.logger.warn(
        `Fibe sync ${type} item ${batch.entries[0].id} (conversation ${conversationId}) was refused: ${detail}. Its sync request is ${batch.bytes} bytes and this Fibe API refuses request bodies over ${FIBE_API_BODY_LIMIT_BYTES} bytes; upgrade the Fibe API to sync it. Retrying when the item changes or every ${FibeSyncService.OVERSIZED_RETRY_MS / 60_000} minutes.`,
      );
      return Date.now() + FibeSyncService.OVERSIZED_RETRY_MS;
    }
    this.logger.warn(
      `Fibe sync ${type} refused: ${detail} (${batch.entries.length} item(s), ${batch.bytes} bytes, conversation ${conversationId}); not retried until those items change`,
    );
    return undefined;
  }

  /**
   * 401/403 end the sync as today; 413/422 are `refused` (this body can never
   * be accepted); anything else (5xx, network, timeout) is `failed` and
   * retried with backoff.
   */
  private async put(
    type: SyncType,
    url: string,
    apiKey: string,
    body: string,
  ): Promise<{ outcome: PutOutcome; detail: string }> {
    try {
      return await this.withRequest(async (signal) => {
        const res = await fetch(url, {
          signal,
          method: 'PUT',
          headers: {
            ...this.config.getFibeOwnerProofHeaders?.(),
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body,
        });
        if (res.ok) return { outcome: 'ok' as const, detail: '' };

        const text = await res.text().catch(() => '');
        const detail = `${res.status} ${res.statusText}${text ? ` ${text.slice(0, 200)}` : ''}`;
        if (res.status === 413 || res.status === 422) {
          return { outcome: 'refused' as const, detail };
        }
        this.logger.warn(`Fibe sync ${type} failed: ${detail}`);
        const outcome: PutOutcome =
          res.status === 401 || res.status === 403 ? 'unauthorized' : 'failed';
        return { outcome, detail };
      });
    } catch (err) {
      this.logger.warn(`Fibe sync ${type} error: ${err}`);
      return { outcome: 'failed', detail: String(err) };
    }
  }

  /** The deadline includes response-body reads. Shutdown aborts every owned request. */
  private async withRequest<T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.stopped) throw new Error('Fibe sync is stopped');
    const controller = new AbortController();
    this.requests.add(controller);
    const timer = setTimeout(
      () => controller.abort(),
      FibeSyncService.REQUEST_TIMEOUT_MS,
    );
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timer);
      this.requests.delete(controller);
    }
  }

  private syncTarget(
    type: SyncType,
  ): { apiUrl: string; apiKey: string; agentId: string } | null {
    const enabled =
      this.settingsStore?.isEnabled(type) ?? this.config.isFibeSyncEnabled();
    if (!enabled) return null;

    const apiUrl = this.config.getFibeApiUrl();
    const apiKey = this.config.getFibeApiKey();
    const agentId = this.config.getFibeAgentId();
    if (!apiUrl || !apiKey || !agentId) return null;

    return { apiUrl, apiKey, agentId };
  }

  private syncKey(type: SyncType, conversationId: string): string {
    return `${type}:${conversationId}`;
  }

  async hydrate(type: 'messages' | 'activity'): Promise<string | null> {
    if (
      this.stopped ||
      !this.config.isFibeSyncEnabled() ||
      !this.config.isFibeHydrateEnabled()
    )
      return null;

    const apiUrl = this.config.getFibeApiUrl();
    const apiKey = this.config.getFibeApiKey();
    const agentId = this.config.getFibeAgentId();

    if (!apiUrl || !apiKey || !agentId) return null;

    const url = `${apiUrl}/api/agents/${agentId}/${type}`;

    try {
      return await this.withRequest(async (signal) => {
        const res = await fetch(url, {
          signal,
          method: 'GET',
          headers: {
            ...this.config.getFibeOwnerProofHeaders?.(),
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!res.ok) {
          if (res.status !== 404) {
            this.logger.warn(
              `Fibe hydrate ${type} failed: ${res.status} ${res.statusText}`,
            );
          }
          return null;
        }

        const data = (await res.json()) as { content?: string };
        return data?.content ?? null;
      });
    } catch (err) {
      this.logger.warn(`Fibe hydrate ${type} error: ${err}`);
      return null;
    }
  }
}
