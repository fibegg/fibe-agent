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
}

export const DEFAULT_CONVERSATION_ID = 'default';
export const DEFAULT_CONVERSATION_TITLE = 'INBOX';

export interface ConversationBundle {
  meta: ConversationMeta;
  messageStore: MessageStoreService;
  activityStore: ActivityStoreService;
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

  constructor(private readonly config: ConfigService) {
    this.conversationsDir = join(config.getDataDir(), 'conversations');
    this.indexPath = join(this.conversationsDir, 'index.json');
    mkdirSync(this.conversationsDir, { recursive: true });
    this.loadIndex();
    this.ensureDefaultConversation();
  }

  /** List all conversations sorted by lastMessageAt desc. */
  list(): ConversationMeta[] {
    return [...this.bundles.values()]
      .map((b) => b.meta)
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
    return this.getOrCreate(id).messageStore.all();
  }

  activities(id: string): StoredActivityEntry[] {
    return this.getOrCreate(id).activityStore.all();
  }

  dataDirProvider(id: string): ConversationDataDirProvider {
    return { getConversationDataDir: () => this.convDir(id) };
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
    };
    this.createBundle(id, meta);
    this.logger.log(`Conversation created: ${id}`);
    return meta;
  }

  /** Update the title of an existing conversation. */
  setTitle(id: string, title: string): boolean {
    if (id === DEFAULT_CONVERSATION_ID) return false;
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

  /** Delete a conversation (metadata + in-memory; files removed from disk). */
  delete(id: string): boolean {
    if (id === DEFAULT_CONVERSATION_ID) return false;
    if (!this.bundles.has(id)) return false;
    this.bundles.delete(id);
    this.flushIndex();
    // Remove workspace files from disk so Claude sessions can't be accidentally resumed
    // and disk space is reclaimed. Files can always be recovered from backup if needed.
    const dir = this.convDir(id);
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(`Failed to remove conversation dir ${dir}: ${err}`);
    }
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

  private createBundle(id: string, meta?: ConversationMeta): ConversationBundle {
    const dir = this.convDir(id);
    mkdirSync(dir, { recursive: true });

    const scopedConfig = new ConversationScopedConfig(dir, this.config) as unknown as ConfigService;
    const messageStore = new MessageStoreService(scopedConfig);
    const activityStore = new ActivityStoreService(scopedConfig);

    const now = new Date().toISOString();
    const resolvedMeta: ConversationMeta = meta ?? {
      id,
      title: id === DEFAULT_CONVERSATION_ID ? DEFAULT_CONVERSATION_TITLE : 'New chat',
      createdAt: now,
      lastMessageAt: now,
    };

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
          this.createBundle(meta.id, meta);
        }
      }
    } catch {
      this.logger.warn('Failed to parse conversations index, starting fresh');
    }
  }

  private ensureDefaultConversation(): void {
    const existing = this.bundles.get(DEFAULT_CONVERSATION_ID);
    if (existing) {
      if (existing.meta.title !== DEFAULT_CONVERSATION_TITLE) {
        existing.meta.title = DEFAULT_CONVERSATION_TITLE;
        this.flushIndex();
      }
      return;
    }
    const now = new Date().toISOString();
    this.createBundle(DEFAULT_CONVERSATION_ID, {
      id: DEFAULT_CONVERSATION_ID,
      title: DEFAULT_CONVERSATION_TITLE,
      createdAt: now,
      lastMessageAt: now,
    });
  }

  private flushIndex(): void {
    try {
      const metas = [...this.bundles.values()].map((b) => b.meta);
      writeFileSync(this.indexPath, JSON.stringify(metas, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn('Failed to flush conversations index', err);
    }
  }
}
