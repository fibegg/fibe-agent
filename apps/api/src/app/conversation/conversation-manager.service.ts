import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { MessageStoreService, type StoredMessage } from '../message-store/message-store.service';
import { ActivityStoreService, type StoredActivityEntry } from '../activity-store/activity-store.service';
import type { ConversationDataDirProvider } from '../strategies/strategy.types';

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  readonly?: boolean;
  system?: boolean;
  hiddenWhenEmpty?: boolean;
  messageCount?: number;
  isProcessing?: boolean;
}

export const DEFAULT_CONVERSATION_ID = 'default';
export const DEFAULT_CONVERSATION_TITLE = 'Default';
export const INBOX_CONVERSATION_ID = 'inbox';
export const INBOX_CONVERSATION_TITLE = 'INBOX';

export interface ConversationBundle {
  meta: ConversationMeta;
  messageStore: MessageStoreService;
  activityStore: ActivityStoreService;
}

interface ConversationTombstone {
  id: string;
  dir: string;
  tombstonedAt: string;
}

/**
 * Minimal config shim for per-conversation store instances.
 * Delegates everything to the real ConfigService but overrides
 * getConversationDataDir() to return the conversation-specific dir.
 */
class ConversationScopedConfig {
  constructor(
    private readonly dir: string,
    private readonly real: ConfigService,
  ) {}
  getConversationDataDir(): string { return this.dir; }
  getEncryptionKey() { return this.real.getEncryptionKey(); }
}

/**
 * Manages named, persistent conversation contexts.
 *
 * Each conversation gets its own MessageStore + ActivityStore backed
 * by `<dataDir>/conversations/<id>/`.  Metadata (title, timestamps) is
 * persisted to `<dataDir>/conversations/index.json`.
 *
 * The singleton `MessageStoreService` / `ActivityStoreService` injected
 * into other services still works for the "default" legacy conversation.
 */
@Injectable()
export class ConversationManagerService {
  private readonly logger = new Logger(ConversationManagerService.name);
  private readonly bundles = new Map<string, ConversationBundle>();
  private readonly conversationsDir: string;
  private readonly indexPath: string;
  private readonly tombstonesPath: string;
  private cleanupRetryTimer?: NodeJS.Timeout;

  constructor(private readonly config: ConfigService) {
    this.conversationsDir = join(config.getDataDir(), 'conversations');
    this.indexPath = join(this.conversationsDir, 'index.json');
    this.tombstonesPath = join(this.conversationsDir, 'tombstones.json');
    mkdirSync(this.conversationsDir, { recursive: true });
    this.loadIndex();
    this.ensureDefaultConversation();
    if (this.retryTombstonedCleanup() > 0) this.scheduleTombstoneRetry();
  }

  /** List visible conversations sorted by lastMessageAt desc. */
  list(): ConversationMeta[] {
    return [...this.bundles.values()]
      .map((b) => this.enrichedMeta(b))
      .filter((meta) => !meta.hiddenWhenEmpty || (meta.messageCount ?? 0) > 0)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }

  /** Get existing bundle or throw. */
  get(id: string): ConversationBundle | undefined {
    return this.bundles.get(id);
  }

  /**
   * Get or create a conversation bundle by ID.
   * If id is 'default', uses the legacy single-conversation dir.
   */
  getOrCreate(id: string): ConversationBundle {
    const existing = this.bundles.get(id);
    if (existing) return existing;
    return this.createBundle(id);
  }

  messages(id: string): StoredMessage[] {
    return this.requireExistingOrDefault(id).messageStore.all();
  }

  activities(id: string): StoredActivityEntry[] {
    return this.requireExistingOrDefault(id).activityStore.all();
  }

  dataDirProvider(id: string): ConversationDataDirProvider {
    return {
      getConversationDataDir: () => this.convDir(id),
      getDefaultConversationDataDir: () => this.config.getConversationDataDir(),
      getConversationId: () => id,
    };
  }

  dataDirFor(id: string): string {
    return this.convDir(id);
  }

  /** Create a brand-new conversation, persist, and return its meta. */
  create(title?: string): ConversationMeta {
    const id = randomUUID();
    const now = new Date().toISOString();
    const meta: ConversationMeta = {
      id,
      title: title ?? 'New chat',
      createdAt: now,
      lastMessageAt: now,
      readonly: false,
      system: false,
      hiddenWhenEmpty: false,
    };
    const bundle = this.createBundle(id, meta);
    this.logger.log(`Conversation created: ${id}`);
    return this.enrichedMeta(bundle);
  }

  /** Update the title of an existing conversation. */
  setTitle(id: string, title: string): boolean {
    if (this.isProtected(id)) return false;
    const bundle = this.bundles.get(id);
    if (!bundle) return false;
    bundle.meta.title = title;
    this.flushIndex();
    return true;
  }

  /** Touch the lastMessageAt timestamp. */
  touch(id: string): void {
    const bundle = this.bundles.get(id);
    if (!bundle) return;
    bundle.meta.lastMessageAt = new Date().toISOString();
    this.flushIndex();
  }

  /**
   * Read the Claude native session ID stored in the conversation state dir.
   * The default conversation also falls back to the legacy workspace marker.
   */
  getClaudeSessionMarker(id: string): string | null {
    return this.readSessionMarker(join(this.convDir(id), '.claude_session'))
      ?? (id === DEFAULT_CONVERSATION_ID ? this.readSessionMarker(join(this.claudeWorkspaceDir(id), '.claude_session')) : null);
  }

  /**
   * Write (or clear when sessionId is null/empty) the Claude session marker.
   * This allows importing existing native Claude sessions into a conversation.
   */
  setClaudeSessionMarker(id: string, sessionId: string | null): boolean {
    const dir = this.convDir(id);
    const markerPath = join(dir, '.claude_session');
    try {
      if (sessionId?.trim()) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(markerPath, sessionId.trim());
      } else {
        if (existsSync(markerPath)) rmSync(markerPath, { force: true });
        if (id === DEFAULT_CONVERSATION_ID) {
          const legacyPath = join(this.claudeWorkspaceDir(id), '.claude_session');
          if (existsSync(legacyPath)) rmSync(legacyPath, { force: true });
        }
      }
      return true;
    } catch (err) {
      this.logger.warn(`Failed to update Claude session marker for ${id}: ${err}`);
      return false;
    }
  }

  /** Delete a conversation (metadata + in-memory; files removed from disk). */
  delete(id: string): boolean {
    if (this.isProtected(id)) return false;
    if (!this.bundles.has(id)) return false;
    this.bundles.delete(id);
    this.flushIndex();
    const dir = this.convDir(id);
    if (!this.removeConversationDir(id, dir)) this.markTombstoned(id, dir);
    this.logger.log(`Conversation deleted: ${id}`);
    return true;
  }

  // ── private ────────────────────────────────────────────────────────────

  private convDir(id: string): string {
    // 'default' uses the legacy getConversationDataDir() path so existing
    // single-conversation installs are unaffected.
    if (id === DEFAULT_CONVERSATION_ID) return this.config.getConversationDataDir();
    return join(this.conversationsDir, id);
  }

  /** Path to the claude_workspace sub-directory for a conversation. */
  private claudeWorkspaceDir(id: string): string {
    return join(this.convDir(id), 'claude_workspace');
  }

  private readSessionMarker(path: string): string | null {
    if (!existsSync(path)) return null;
    try {
      const stored = readFileSync(path, 'utf8').trim();
      return stored || null;
    } catch {
      return null;
    }
  }

  private createBundle(id: string, meta?: ConversationMeta): ConversationBundle {
    const dir = this.convDir(id);
    mkdirSync(dir, { recursive: true });

    const scopedConfig = new ConversationScopedConfig(dir, this.config) as unknown as ConfigService;
    const messageStore = new MessageStoreService(scopedConfig);
    const activityStore = new ActivityStoreService(scopedConfig);

    const now = new Date().toISOString();
    const resolvedMeta: ConversationMeta = meta ?? {
      id,
      title: this.defaultTitleFor(id),
      createdAt: now,
      lastMessageAt: now,
    };
    this.applySystemFlags(resolvedMeta);

    const bundle: ConversationBundle = { meta: resolvedMeta, messageStore, activityStore };
    this.bundles.set(id, bundle);
    this.flushIndex();
    return bundle;
  }

  private loadIndex(): void {
    if (!existsSync(this.indexPath)) return;
    try {
      const raw = readFileSync(this.indexPath, 'utf8');
      const metas: ConversationMeta[] = JSON.parse(raw);
      for (const meta of metas) {
        if (!this.bundles.has(meta.id)) {
          this.applySystemFlags(meta);
          this.createBundle(meta.id, meta);
        }
      }
    } catch {
      this.logger.warn('Failed to parse conversations index, starting fresh');
    }
  }

  private ensureDefaultConversation(): void {
    this.ensureSystemConversation(DEFAULT_CONVERSATION_ID, DEFAULT_CONVERSATION_TITLE);
    this.ensureSystemConversation(INBOX_CONVERSATION_ID, INBOX_CONVERSATION_TITLE);
  }

  private ensureSystemConversation(id: string, title: string): void {
    const existing = this.bundles.get(id);
    if (existing) {
      if (existing.meta.title !== title) {
        existing.meta.title = title;
        this.flushIndex();
      }
      this.applySystemFlags(existing.meta);
      return;
    }
    const now = new Date().toISOString();
    this.createBundle(id, {
      id,
      title,
      createdAt: now,
      lastMessageAt: now,
    });
  }

  private requireExistingOrDefault(id: string): ConversationBundle {
    if (id === DEFAULT_CONVERSATION_ID || id === INBOX_CONVERSATION_ID) {
      return this.getOrCreate(id);
    }
    const bundle = this.get(id);
    if (!bundle) throw new Error(`Conversation not found: ${id}`);
    return bundle;
  }

  private enrichedMeta(bundle: ConversationBundle): ConversationMeta {
    this.applySystemFlags(bundle.meta);
    return {
      ...bundle.meta,
      messageCount: bundle.messageStore.all().length,
    };
  }

  private applySystemFlags(meta: ConversationMeta): void {
    if (meta.id === DEFAULT_CONVERSATION_ID) {
      meta.title = DEFAULT_CONVERSATION_TITLE;
      meta.readonly = false;
      meta.system = false;
      meta.hiddenWhenEmpty = false;
      return;
    }
    if (meta.id === INBOX_CONVERSATION_ID) {
      meta.title = INBOX_CONVERSATION_TITLE;
      meta.readonly = true;
      meta.system = true;
      meta.hiddenWhenEmpty = true;
      return;
    }
    meta.readonly = false;
    meta.system = false;
    meta.hiddenWhenEmpty = false;
  }

  private defaultTitleFor(id: string): string {
    if (id === DEFAULT_CONVERSATION_ID) return DEFAULT_CONVERSATION_TITLE;
    if (id === INBOX_CONVERSATION_ID) return INBOX_CONVERSATION_TITLE;
    return 'New chat';
  }

  private isProtected(id: string): boolean {
    return id === DEFAULT_CONVERSATION_ID || id === INBOX_CONVERSATION_ID;
  }

  private flushIndex(): void {
    try {
      const metas = [...this.bundles.values()].map((b) => {
        const { messageCount: _messageCount, isProcessing: _isProcessing, ...meta } = b.meta;
        return meta;
      });
      writeFileSync(this.indexPath, JSON.stringify(metas, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn('Failed to flush conversations index', err);
    }
  }

  private removeConversationDir(id: string, dir: string): boolean {
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      return !existsSync(dir);
    } catch (err) {
      this.logger.warn(`Failed to remove conversation dir ${dir} for ${id}: ${err}`);
      return false;
    }
  }

  private markTombstoned(id: string, dir: string): void {
    const tombstones = this.readTombstones();
    const existing = tombstones.find((entry) => entry.id === id);
    if (existing) {
      existing.dir = dir;
      existing.tombstonedAt = new Date().toISOString();
    } else {
      tombstones.push({ id, dir, tombstonedAt: new Date().toISOString() });
    }
    this.writeTombstones(tombstones);
    this.scheduleTombstoneRetry();
  }

  private retryTombstonedCleanup(): number {
    const remaining = this.readTombstones().filter((entry) => !this.removeConversationDir(entry.id, entry.dir));
    this.writeTombstones(remaining);
    return remaining.length;
  }

  private scheduleTombstoneRetry(): void {
    if (this.cleanupRetryTimer) return;
    this.cleanupRetryTimer = setTimeout(() => {
      this.cleanupRetryTimer = undefined;
      if (this.retryTombstonedCleanup() > 0) this.scheduleTombstoneRetry();
    }, 30_000);
    this.cleanupRetryTimer.unref?.();
  }

  private readTombstones(): ConversationTombstone[] {
    if (!existsSync(this.tombstonesPath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.tombstonesPath, 'utf8'));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is ConversationTombstone => (
        typeof entry?.id === 'string'
        && typeof entry.dir === 'string'
        && typeof entry.tombstonedAt === 'string'
      ));
    } catch (err) {
      this.logger.warn(`Failed to read conversation tombstones: ${err}`);
      return [];
    }
  }

  private writeTombstones(tombstones: ConversationTombstone[]): void {
    try {
      if (tombstones.length === 0) {
        if (existsSync(this.tombstonesPath)) rmSync(this.tombstonesPath, { force: true });
        return;
      }
      writeFileSync(this.tombstonesPath, JSON.stringify(tombstones, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn(`Failed to write conversation tombstones: ${err}`);
    }
  }
}
