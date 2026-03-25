import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { SequentialJsonWriter } from '../persistence/sequential-json-writer';
import { decryptData } from '../crypto/crypto.util';
import type { StoredStoryEntry } from '@shared/types';

export type { StoredStoryEntry } from '@shared/types';

export interface StoredMessage {
  id: string;
  role: string;
  body: string;
  created_at: string;
  imageUrls?: string[];
  story?: StoredStoryEntry[];
  activityId?: string;
  model?: string;
}

@Injectable()
export class MessageStoreService {
  private readonly messagesPath: string;
  private readonly jsonWriter: SequentialJsonWriter;
  private messages: StoredMessage[] = [];

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getConversationDataDir();
    this.messagesPath = join(dataDir, 'messages.json');
    this.jsonWriter = new SequentialJsonWriter(
      this.messagesPath, 
      () => this.messages,
      this.config.getEncryptionKey()
    );
    this.ensureDataDir();
    this.messages = this.load();
  }

  all(): StoredMessage[] {
    return this.messages;
  }

  add(role: string, body: string, imageUrls?: string[], model?: string): StoredMessage {
    const message: StoredMessage = {
      id: randomUUID(),
      role,
      body,
      created_at: new Date().toISOString(),
      ...(imageUrls?.length ? { imageUrls } : {}),
      ...(model ? { model } : {}),
    };
    this.messages.push(message);
    this.jsonWriter.schedule();
    return message;
  }

  finalizeLastAssistant(story: StoredStoryEntry[], activityId?: string): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.role === 'assistant') {
      if (Array.isArray(story)) last.story = story;
      if (activityId) last.activityId = activityId;
      this.jsonWriter.schedule();
    }
  }

  clear(): void {
    this.messages = [];
    this.jsonWriter.schedule();
  }

  private ensureDataDir(): void {
    const dataDir = this.config.getConversationDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  private load(): StoredMessage[] {
    if (!existsSync(this.messagesPath)) return [];
    try {
      const raw = readFileSync(this.messagesPath, 'utf8');
      const decrypted = decryptData(raw, this.config.getEncryptionKey());
      return JSON.parse(decrypted);
    } catch (err) {
      console.error('Failed to parse messages load:', err);
      return [];
    }
  }

}
