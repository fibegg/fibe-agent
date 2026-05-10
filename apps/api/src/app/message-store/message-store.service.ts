import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { SequentialJsonWriter } from '../persistence/sequential-json-writer';
import { decryptData } from '../crypto/crypto.util';

export interface StoryEntry {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  details?: string;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  created_at: string;
  story?: StoryEntry[];
  model?: string;
  activityId?: string;
  imageUrls?: string[];
  attachmentFilenames?: string[];
}

/** Alias for consumers that import the story-entry type from this module. */
export type StoredStoryEntry = StoryEntry;

@Injectable()
export class MessageStoreService implements OnModuleDestroy {
  private messages: StoredMessage[] = [];
  /** O(1) lookups and mutations by message ID. */
  private readonly indexById = new Map<string, StoredMessage>();
  private readonly storePath: string;
  private readonly previousMessagesPath: string;
  private readonly jsonWriter: SequentialJsonWriter;

  constructor(private readonly config: ConfigService) {
    const dir = this.config.getConversationDataDir();
    this.storePath = join(dir, 'messages.json');
    this.previousMessagesPath = join(dir, 'messages.previous.json');

    this.jsonWriter = new SequentialJsonWriter(
      this.storePath,
      () => this.messages,
      this.config.getEncryptionKey(),
      200, // debounce — rapid successive writes coalesce into one atomic flush
    );

    if (existsSync(this.storePath)) {
      try {
        const raw = readFileSync(this.storePath, 'utf8');
        const decrypted = decryptData(raw, this.config.getEncryptionKey());
        this.messages = JSON.parse(decrypted);
        this.rebuildIndex();
      } catch (err) {
        console.error('Failed to parse messages.json:', err);
      }
    }
  }

  all(): StoredMessage[] {
    return this.messages;
  }

  /** O(1) count without building a new array. */
  count(): number {
    return this.messages.length;
  }

  /** O(1) lookup by ID. */
  getById(id: string): StoredMessage | undefined {
    return this.indexById.get(id);
  }

  add(role: 'user' | 'assistant', body: string, imageUrls?: string[], model?: string, attachmentFilenames?: string[]): StoredMessage {
    const msg: StoredMessage = {
      id: randomUUID(),
      role,
      body,
      created_at: new Date().toISOString(),
    };
    if (imageUrls?.length) msg.imageUrls = imageUrls;
    if (model) msg.model = model;
    if (attachmentFilenames?.length) msg.attachmentFilenames = attachmentFilenames;

    this.messages.push(msg);
    this.indexById.set(msg.id, msg);
    this.jsonWriter.schedule();
    return msg;
  }

  /** O(1) body update via Map index. */
  updateBody(id: string, body: string): boolean {
    const msg = this.indexById.get(id);
    if (!msg) return false;
    msg.body = body;
    this.jsonWriter.schedule();
    return true;
  }

  /** O(1) removal via Map index. */
  removeById(id: string): boolean {
    const msg = this.indexById.get(id);
    if (!msg) return false;
    this.indexById.delete(id);
    this.messages = this.messages.filter((m) => m.id !== id);
    this.jsonWriter.schedule();
    return true;
  }

  clear(): void {
    this.messages = [];
    this.indexById.clear();
    this.jsonWriter.schedule();
  }

  /**
   * Archive the current messages to messages.previous.json, then clear the active store.
   * A single rolling archive is kept (previous is overwritten on each reset).
   */
  reset(): void {
    if (this.messages.length > 0) {
      try {
        writeFileSync(this.previousMessagesPath, JSON.stringify(this.messages, null, 2), 'utf8');
      } catch (err) {
        console.error('Failed to archive messages to previous:', err);
      }
    }
    this.messages = [];
    this.indexById.clear();
    this.jsonWriter.schedule();
  }

  hydrate(messages: StoredMessage[]): void {
    if (Array.isArray(messages) && messages.length > 0) {
      this.messages = messages;
      this.rebuildIndex();
      this.jsonWriter.schedule();
    }
  }

  finalizeLastAssistant(story: StoryEntry[], activityId?: string | null): void {
    if (this.messages.length === 0) return;
    const last = this.messages[this.messages.length - 1];
    if (last.role === 'assistant') {
      last.story = story;
      if (activityId) last.activityId = activityId;
      this.jsonWriter.schedule();
    }
  }

  flush(): Promise<void> {
    return this.jsonWriter.flush();
  }

  async onModuleDestroy(): Promise<void> {
    await this.jsonWriter.flush();
    this.jsonWriter.destroy();
  }

  private rebuildIndex(): void {
    this.indexById.clear();
    for (const msg of this.messages) {
      this.indexById.set(msg.id, msg);
    }
  }
}
