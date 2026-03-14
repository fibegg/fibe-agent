import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';

export interface StoredStoryEntry {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  details?: string;
  command?: string;
  path?: string;
}

export interface StoredMessage {
  id: string;
  role: string;
  body: string;
  created_at: string;
  imageUrls?: string[];
  story?: StoredStoryEntry[];
}

@Injectable()
export class MessageStoreService {
  private readonly messagesPath: string;
  private messages: StoredMessage[] = [];

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getDataDir();
    this.messagesPath = join(dataDir, 'messages.json');
    this.ensureDataDir();
    this.messages = this.load();
  }

  all(): StoredMessage[] {
    return this.messages;
  }

  add(role: string, body: string, imageUrls?: string[]): StoredMessage {
    const message: StoredMessage = {
      id: randomUUID(),
      role,
      body,
      created_at: new Date().toISOString(),
      ...(imageUrls?.length ? { imageUrls } : {}),
    };
    this.messages.push(message);
    this.save();
    return message;
  }

  setStoryForLastAssistant(story: StoredStoryEntry[]): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.role === 'assistant' && Array.isArray(story)) {
      last.story = story;
      this.save();
    }
  }

  clear(): void {
    this.messages = [];
    this.save();
  }

  private ensureDataDir(): void {
    const dataDir = this.config.getDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  private load(): StoredMessage[] {
    if (!existsSync(this.messagesPath)) return [];
    try {
      return JSON.parse(readFileSync(this.messagesPath, 'utf8'));
    } catch {
      return [];
    }
  }

  private save(): void {
    writeFileSync(
      this.messagesPath,
      JSON.stringify(this.messages, null, 2)
    );
  }
}
