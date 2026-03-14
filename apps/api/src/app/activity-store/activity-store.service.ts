import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

  append(story: StoredStoryEntry[]): StoredActivityEntry {
    const entry: StoredActivityEntry = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      story: Array.isArray(story) ? story : [],
    };
    this.activities.push(entry);
    this.save();
    return entry;
  }

  clear(): void {
    this.activities = [];
    this.save();
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

  private save(): void {
    writeFileSync(
      this.activityPath,
      JSON.stringify(this.activities, null, 2)
    );
  }
}
