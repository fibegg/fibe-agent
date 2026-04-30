import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { AsyncJsonWriter } from '../../utils/async-json-writer';

export interface StoryEntry {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  created_at: string;
  story?: StoryEntry[];
  model?: string;
}

@Injectable()
export class MessageStoreService implements OnModuleDestroy {
  private messages: StoredMessage[] = [];
  private readonly storePath: string;
  private readonly previousMessagesPath: string;
  private readonly jsonWriter: AsyncJsonWriter<StoredMessage[]>;

  constructor(private readonly config: ConfigService) {
    const dir = this.config.getConversationDataDir();
    this.storePath = join(dir, 'messages.json');
    this.previousMessagesPath = join(dir, 'messages.previous.json');
    
    this.jsonWriter = new AsyncJsonWriter({
      filePath: this.storePath,
      getData: () => this.messages,
      encryptionKey: this.config.getEncryptionKey(),
    });

    if (existsSync(this.storePath)) {
      try {
        const raw = readFileSync(this.storePath, 'utf8');
        this.messages = JSON.parse(raw);
      } catch (err) {
        console.error('Failed to parse messages.json:', err);
      }
    }
  }

  all(): StoredMessage[] {
    return this.messages;
  }

  add(role: 'user' | 'assistant', body: string, story?: StoryEntry[], model?: string): StoredMessage {
    const msg: StoredMessage = {
      id: randomUUID(),
      role,
      body,
      created_at: new Date().toISOString(),
    };
    if (story) msg.story = story;
    if (model) msg.model = model;

    this.messages.push(msg);
    this.jsonWriter.schedule();
    return msg;
  }

  clear(): void {
    this.messages = [];
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
    this.jsonWriter.schedule();
  }

  hydrate(messages: StoredMessage[]): void {
    if (Array.isArray(messages) && messages.length > 0) {
      this.messages = messages;
      this.jsonWriter.schedule();
    }
  }

  finalizeLastAssistant(story: StoryEntry[]): void {
    if (this.messages.length === 0) return;
    const last = this.messages[this.messages.length - 1];
    if (last.role === 'assistant') {
      last.story = story;
      this.jsonWriter.schedule();
    }
  }

  flush(): Promise<void> {
    return this.jsonWriter.flush();
  }

  async onModuleDestroy(): Promise<void> {
    await this.jsonWriter.flush();
  }
}
