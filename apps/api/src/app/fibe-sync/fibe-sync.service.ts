import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { FibeSyncSettingsStoreService } from './fibe-sync-settings-store.service';

type SyncType = 'messages' | 'activity' | 'provider_traffic';

interface PendingSync {
  type: SyncType;
  conversationId: string;
  getContent: () => string;
  timer: ReturnType<typeof setTimeout> | null;
  syncing: boolean;
  version: number;
  retryCount: number;
}

@Injectable()
export class FibeSyncService {
  private readonly logger = new Logger(FibeSyncService.name);
  private readonly pendingSyncs = new Map<string, PendingSync>();
  private static readonly DEBOUNCE_MS = 500;
  private static readonly RETRY_INITIAL_MS = 1000;
  private static readonly RETRY_MAX_MS = 30_000;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly settingsStore?: FibeSyncSettingsStoreService
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
    for (const pending of this.pendingSyncs.values()) {
      if (pending.timer) clearTimeout(pending.timer);
    }
    this.pendingSyncs.clear();
  }

  private scheduleSync(type: SyncType, getContent: () => string, conversationId?: string): void {
    if (!this.syncTarget(type)) return;

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
      pending.timer = setTimeout(() => void this.flushPendingSync(key), FibeSyncService.DEBOUNCE_MS);
    }
  }

  private async flushPendingSync(key: string): Promise<void> {
    const pending = this.pendingSyncs.get(key);
    if (!pending || pending.syncing) return;

    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = null;
    pending.syncing = true;
    const version = pending.version;

    let content: string;
    try {
      content = pending.getContent();
    } catch (err) {
      this.logger.error(`Error resolving ${pending.type} content for sync: ${err}`);
      this.pendingSyncs.delete(key);
      return;
    }

    const ok = await this.sync(pending.type, content, pending.conversationId);
    const current = this.pendingSyncs.get(key);
    if (!current) return;

    current.syncing = false;
    if (ok) {
      if (current.version === version) {
        this.pendingSyncs.delete(key);
      } else {
        current.timer = setTimeout(() => void this.flushPendingSync(key), FibeSyncService.DEBOUNCE_MS);
      }
      return;
    }

    this.scheduleRetry(key, current);
  }

  private scheduleRetry(key: string, pending: PendingSync): void {
    const delay = Math.min(
      FibeSyncService.RETRY_MAX_MS,
      FibeSyncService.RETRY_INITIAL_MS * 2 ** Math.min(pending.retryCount, 5),
    );
    pending.retryCount += 1;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => void this.flushPendingSync(key), delay);
  }

  private async sync(
    type: SyncType,
    content: string,
    conversationId: string
  ): Promise<boolean> {
    const target = this.syncTarget(type);
    if (!target) return true;
    const { apiUrl, apiKey, agentId } = target;
    const url = `${apiUrl}/api/agents/${agentId}/${type}`;

    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          content,
          conversation_id: conversationId || 'default',
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `Fibe sync ${type} failed: ${res.status} ${res.statusText}${body ? ` ${body.slice(0, 200)}` : ''}`
        );
        return res.status === 401 || res.status === 403;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Fibe sync ${type} error: ${err}`);
      return false;
    }
  }

  private syncTarget(type: SyncType): { apiUrl: string; apiKey: string; agentId: string } | null {
    const enabled = this.settingsStore?.isEnabled(type) ?? this.config.isFibeSyncEnabled();
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
    if (!this.config.isFibeSyncEnabled() || !this.config.isFibeHydrateEnabled()) return null;

    const apiUrl = this.config.getFibeApiUrl();
    const apiKey = this.config.getFibeApiKey();
    const agentId = this.config.getFibeAgentId();

    if (!apiUrl || !apiKey || !agentId) return null;

    const url = `${apiUrl}/api/agents/${agentId}/${type}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        if (res.status !== 404) {
          this.logger.warn(`Fibe hydrate ${type} failed: ${res.status} ${res.statusText}`);
        }
        return null;
      }

      const data = (await res.json()) as { content?: string };
      return data?.content ?? null;
    } catch (err) {
      this.logger.warn(`Fibe hydrate ${type} error: ${err}`);
      return null;
    }
  }
}
