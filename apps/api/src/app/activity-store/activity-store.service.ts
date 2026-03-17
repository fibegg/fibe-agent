import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import type { StoredStoryEntry } from '../message-store/message-store.service';

export interface StoredActivityEntry {
  id: string;
  created_at: string;
  story: StoredStoryEntry[];
}

@Injectable()
export class ActivityStoreService {
  private readonly activityPath: string;
  private activities: StoredActivityEntry[] = [];

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getDataDir();
    this.activityPath = join(dataDir, 'activity.json');
    this.ensureDataDir();
    this.activities = this.load();
  }

  all(): StoredActivityEntry[] {
    return this.activities;
  }

  getById(id: string): StoredActivityEntry | undefined {
    return this.activities.find((a) => a.id === id);
  }

  append(story: StoredStoryEntry[]): StoredActivityEntry {
    const entry: StoredActivityEntry = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      story: Array.isArray(story) ? story : [],
    };
    this.activities.push(entry);
    void this.save();
    return entry;
  }

  createWithEntry(firstEntry: StoredStoryEntry): StoredActivityEntry {
    const entry: StoredActivityEntry = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      story: [firstEntry],
    };
    this.activities.push(entry);
    void this.save();
    return entry;
  }

  appendEntry(activityId: string, storyEntry: StoredStoryEntry): void {
    const activity = this.activities.find((a) => a.id === activityId);
    if (activity) {
      activity.story.push(storyEntry);
      void this.save();
    }
  }

  replaceStory(activityId: string, story: StoredStoryEntry[]): void {
    const activity = this.activities.find((a) => a.id === activityId);
    if (activity) {
      activity.story = Array.isArray(story) ? story : [];
      void this.save();
    }
  }

  clear(): void {
    this.activities = [];
    void this.save();
  }

  private ensureDataDir(): void {
    const dataDir = this.config.getDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  private load(): StoredActivityEntry[] {
    if (!existsSync(this.activityPath)) return [];
    try {
      const data = JSON.parse(readFileSync(this.activityPath, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private async save(): Promise<void> {
    await writeFile(
      this.activityPath,
      JSON.stringify(this.activities, null, 2)
    );
  }
}
