import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { SequentialJsonWriter } from '../persistence/sequential-json-writer';
import { decryptData, encryptData } from '../crypto/crypto.util';

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
  apiRequest?: StoredApiRequest;
}

/** Delivery identity on the existing user message; ordinary chat rows omit it. */
export interface StoredApiRequest {
  storeGeneration?: string;
  fingerprint: string;
  text: string;
  conversationId?: string;
  busyPolicy: 'reject' | 'queue' | 'steer';
  images?: string[];
  queueOrder?: number;
  state: 'pending' | 'running' | 'completed' | 'failed' | 'outcome_unknown';
}

/** Alias for consumers that import the story-entry type from this module. */
export type StoredStoryEntry = StoryEntry;

export class StoreGenerationChangedError extends Error {
  constructor() { super('STORE_GENERATION_CHANGED'); }
}

@Injectable()
export class MessageStoreService implements OnModuleDestroy {
  private messages: StoredMessage[] = [];
  /** O(1) lookups and mutations by message ID. */
  private readonly indexById = new Map<string, StoredMessage>();
  private readonly storePath: string;
  private readonly previousMessagesPath: string;
  private readonly generationPath: string;
  private readonly jsonWriter: SequentialJsonWriter;
  private corruptHistory = false;

  constructor(private readonly config: ConfigService) {
    const dir = this.config.getConversationDataDir();
    this.storePath = join(dir, 'messages.json');
    this.previousMessagesPath = join(dir, 'messages.previous.json');
    this.generationPath = join(dir, 'message-store-generation.json');

    this.jsonWriter = new SequentialJsonWriter(
      this.storePath,
      () => this.messages,
      this.config.getEncryptionKey(),
      200, // debounce: rapid successive writes coalesce into one atomic flush
    );

    if (existsSync(this.storePath)) {
      try {
        const raw = readFileSync(this.storePath, 'utf8');
        const decrypted = decryptData(raw, this.config.getEncryptionKey());
        this.messages = JSON.parse(decrypted);
        if (!Array.isArray(this.messages)) throw new Error('messages.json must contain an array');
        this.rebuildIndex();
      } catch (err) {
        this.messages = [];
        this.corruptHistory = true;
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

  /** Only explicit delivery admission creates this metadata; history stays an array. */
  deliveryGeneration(): string {
    if (this.corruptHistory) throw new Error('Cannot admit delivery with corrupt message history');
    const existing = this.readGeneration();
    if (existsSync(this.storePath)) return existing ?? this.writeGeneration();
    // A sidecar without its history is incomplete recovery, not the old scope.
    if (existing) {
      this.messages = [];
      this.indexById.clear();
    }
    const history = JSON.stringify(this.messages);
    this.writeDurably(this.storePath, this.config.getEncryptionKey() ? encryptData(history, this.config.getEncryptionKey()) : history);
    return this.writeGeneration();
  }

  matchesGeneration(expected: string | undefined): boolean {
    return !!expected && !this.corruptHistory && existsSync(this.storePath) && this.readGeneration() === expected;
  }

  assertGeneration(expected: string | undefined): void {
    if (!this.matchesGeneration(expected)) throw new StoreGenerationChangedError();
  }

  assertRequestGeneration(id: string): void {
    const request = this.indexById.get(id)?.apiRequest;
    if (!request) throw new StoreGenerationChangedError();
    this.assertGeneration(request.storeGeneration);
  }

  private readGeneration(): string | undefined {
    if (!existsSync(this.generationPath)) return undefined;
    const metadata = JSON.parse(readFileSync(this.generationPath, 'utf8'));
    if (typeof metadata.generation !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(metadata.generation)) {
      throw new Error('Invalid message store generation metadata');
    }
    return metadata.generation;
  }

  private writeGeneration(): string {
    const generation = randomUUID();
    this.writeDurably(this.generationPath, JSON.stringify({ generation }));
    return generation;
  }

  private writeDurably(path: string, content: string): void {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    const fd = openSync(temporary, 'wx', 0o600);
    try {
      writeFileSync(fd, content, 'utf8');
      fsyncSync(fd);
    } finally { closeSync(fd); }
    try {
      renameSync(temporary, path);
      const directoryFd = openSync(dir, 'r');
      try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }

  private rotateGeneration(): void {
    // Read disk, not an instance cache: legacy and scoped stores can share this directory.
    if (existsSync(this.generationPath) || this.messages.some((message) => message.apiRequest)) this.writeGeneration();
  }

  add(
    role: 'user' | 'assistant',
    body: string,
    imageUrls?: string[],
    model?: string,
    attachmentFilenames?: string[],
    request?: { id: string; metadata: StoredApiRequest },
  ): StoredMessage {
    if (request && this.indexById.has(request.id)) throw new Error('request message already exists');
    const msg: StoredMessage = {
      id: request?.id ?? randomUUID(),
      role,
      body,
      created_at: new Date().toISOString(),
    };
    if (request) msg.apiRequest = request.metadata;
    if (imageUrls?.length) msg.imageUrls = imageUrls;
    if (model) msg.model = model;
    if (attachmentFilenames?.length)
      msg.attachmentFilenames = attachmentFilenames;

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
  removeById(id: string, rotateGeneration = true): boolean {
    const msg = this.indexById.get(id);
    if (!msg) return false;
    if (rotateGeneration && msg.apiRequest) this.rotateGeneration();
    this.indexById.delete(id);
    this.messages = this.messages.filter((m) => m.id !== id);
    this.jsonWriter.schedule();
    return true;
  }

  clear(): void {
    this.rotateGeneration();
    this.corruptHistory = false;
    this.messages = [];
    this.indexById.clear();
    this.jsonWriter.schedule();
  }

  /**
   * Archive the current messages to messages.previous.json, then clear the active store.
   * A single rolling archive is kept (previous is overwritten on each reset).
   */
  reset(): void {
    this.rotateGeneration();
    this.corruptHistory = false;
    if (this.messages.length > 0) {
      try {
        writeFileSync(
          this.previousMessagesPath,
          JSON.stringify(this.messages, null, 2),
          'utf8',
        );
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
      // Control-plane history can lag acceptance. It must not erase the local
      // delivery checkpoint or turn a running request back into recoverable work.
      const localRequests = new Map(this.messages.filter((message) => message.apiRequest).map((message) => [message.id, message]));
      this.messages = messages.map((message) => {
        const local = localRequests.get(message.id);
        localRequests.delete(message.id);
        return local ?? message;
      });
      this.messages.push(...localRequests.values());
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

  flush(strict = false): Promise<void> {
    return this.jsonWriter.flush(strict);
  }

  async updateRequestState(id: string, state: StoredApiRequest['state']): Promise<void> {
    const request = this.indexById.get(id)?.apiRequest;
    if (!request) {
      if (state === 'running') throw new StoreGenerationChangedError();
      return;
    }
    if (state === 'running') this.assertGeneration(request.storeGeneration);
    const previous = request.state;
    request.state = state;
    this.jsonWriter.schedule();
    try {
      await this.flush(true);
      if (state === 'running') {
        this.assertGeneration(request.storeGeneration);
        if (this.indexById.get(id)?.apiRequest !== request) throw new StoreGenerationChangedError();
      }
    } catch (error) {
      request.state = previous;
      throw error;
    }
  }

  updateRequestQueueOrder(id: string, queueOrder: number): void {
    const request = this.indexById.get(id)?.apiRequest;
    if (!request) return;
    request.queueOrder = queueOrder;
    this.jsonWriter.schedule();
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
