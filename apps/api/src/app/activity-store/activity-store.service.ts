import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { SequentialJsonWriter } from '../persistence/sequential-json-writer';
import type { StoredStoryEntry } from '../message-store/message-store.service';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StoredActivityEntry {
  id: string;
  created_at: string;
  story: StoredStoryEntry[];
  usage?: TokenUsage;
}

function dedupeStoryById(story: StoredStoryEntry[]): StoredStoryEntry[] {
  if (!Array.isArray(story) || story.length === 0) return story;
  const seen = new Set<string>();
  return story.filter((e) => {
    if (!e?.id || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

@Injectable()
export class ActivityStoreService {
  private readonly activityPath: string;
  private readonly jsonWriter: SequentialJsonWriter;
  private activities: StoredActivityEntry[] = [];

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getConversationDataDir();
    this.activityPath = join(dataDir, 'activity.json');
    this.jsonWriter = new SequentialJsonWriter(this.activityPath, () => this.activities);
    this.ensureDataDir();
    this.activities = this.load();
  }

  all(): StoredActivityEntry[] {
    return this.activities;
  }

  getById(id: string): StoredActivityEntry | undefined {
    return this.activities.find((a) => a.id === id);
  }

  findByStoryEntryId(entryId: string): StoredActivityEntry | undefined {
    return this.activities.find((a) =>
      Array.isArray(a.story) && a.story.some((e) => e?.id === entryId)
    );
  }

  append(story: StoredStoryEntry[]): StoredActivityEntry {
    const entry: StoredActivityEntry = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      story: dedupeStoryById(Array.isArray(story) ? story : []),
    };
    this.activities.push(entry);
    this.jsonWriter.schedule();
    return entry;
  }

  createWithEntry(firstEntry: StoredStoryEntry): StoredActivityEntry {
    const entry: StoredActivityEntry = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      story: [firstEntry],
    };
    this.activities.push(entry);
    this.jsonWriter.schedule();
    return entry;
  }

  appendEntry(activityId: string, storyEntry: StoredStoryEntry): void {
    const activity = this.activities.find((a) => a.id === activityId);
    if (activity && storyEntry?.id && !activity.story.some((e) => e.id === storyEntry.id)) {
      activity.story.push(storyEntry);
      this.jsonWriter.schedule();
    }
  }

  replaceStory(activityId: string, story: StoredStoryEntry[]): void {
    const activity = this.activities.find((a) => a.id === activityId);
    if (activity) {
      activity.story = dedupeStoryById(Array.isArray(story) ? story : []);
      this.jsonWriter.schedule();
    }
  }

  setUsage(activityId: string, usage: TokenUsage): void {
    const activity = this.activities.find((a) => a.id === activityId);
    if (activity) {
      activity.usage = usage;
      this.jsonWriter.schedule();
    }
  }

  clear(): void {
    this.activities = [];
    this.jsonWriter.schedule();
  }

  private ensureDataDir(): void {
    const dataDir = this.config.getConversationDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  private load(): StoredActivityEntry[] {
    if (!existsSync(this.activityPath)) return [];
    try {
      const data = JSON.parse(readFileSync(this.activityPath, 'utf8'));
      const list = Array.isArray(data) ? data : [];
      return list.map((a: StoredActivityEntry) => ({
        ...a,
        story: dedupeStoryById(Array.isArray(a.story) ? a.story : []),
      }));
    } catch {
      return [];
    }
  }

}
