import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, watch, FSWatcher, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Subject } from 'rxjs';
import { ConfigService } from '../config/config.service';

export interface QueuedMessage {
  text: string;
  timestamp: string;
}

const STEERING_HEADER = '# Player Messages (read & clear this file)\n\n';
const STALE_LOCK_AGE_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 5_000;

@Injectable()
export class SteeringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SteeringService.name);
  private readonly steeringPath: string;
  
  public readonly count$ = new Subject<number>();
  private currentCount = 0;
  private fileWatcher: FSWatcher | null = null;
  private watchTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getDataDir();
    this.steeringPath = resolve(join(dataDir, 'STEERING.md'));
  }

  onModuleInit(): void {
    this.ensureFile();
    this.startWatching();
    this.refreshCount();
    this.startHealthCheck();
  }

  onModuleDestroy(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    if (this.watchTimer) {
      clearTimeout(this.watchTimer);
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  get path(): string {
    return this.steeringPath;
  }

  get count(): number {
    return this.currentCount;
  }

  async enqueue(text: string): Promise<QueuedMessage> {
    if (!text || !text.trim()) {
      throw new Error('Cannot enqueue empty message');
    }

    const entry: QueuedMessage = {
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };
    
    await this.withLock(async () => {
      let content = '';
      try {
        content = await readFile(this.steeringPath, 'utf8');
      } catch (e) {
        // File may have been deleted externally — recreate on write
      }

      const formatted = `- [${entry.timestamp}] ${entry.text}\n`;
      let newContent = '';
      if (content.trim().length === 0) {
        newContent = `${STEERING_HEADER}${formatted}`;
      } else {
        newContent = `${content}${formatted}`;
      }
      
      await writeFile(this.steeringPath, newContent);
      this.logger.log(`Appended message to STEERING.md: ${entry.text.slice(0, 80)}`);
    });

    // Refresh count immediately since we know we just wrote to it
    this.refreshCount();
    return entry;
  }

  /** Reset the queue. Usually only called manually from Orchestrator. */
  async resetQueue(): Promise<void> {
    await this.withLock(async () => {
      await writeFile(this.steeringPath, '');
    });
    this.refreshCount();
  }

  async awaitPendingWrites(): Promise<void> {
    // With immediate await logic in enqueue, this exists for backwards compat with tests
    return Promise.resolve();
  }

  private ensureFile(): void {
    const dataDir = this.config.getDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    if (!existsSync(this.steeringPath)) {
      try {
        writeFileSync(this.steeringPath, ''); // using sync to ensure it exists before watching
        this.logger.log(`Created STEERING.md at ${this.steeringPath}`);
      } catch (e) {
        // ignore
      }
    }
  }

  private startWatching(): void {
    // Close existing watcher if any
    if (this.fileWatcher) {
      try { this.fileWatcher.close(); } catch { /* ignore */ }
      this.fileWatcher = null;
    }
    try {
      this.fileWatcher = watch(this.steeringPath, (eventType) => {
        if (eventType === 'rename') {
          // File may have been deleted — re-ensure and re-watch on next health check
          this.refreshCount();
          return;
        }
        // Debounce read to avoid multi-event thrashing
        if (this.watchTimer) clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => this.refreshCount(), 100);
      });
      this.fileWatcher.on('error', () => {
        this.logger.warn('File watcher error on STEERING.md — will recover on next health check');
        this.fileWatcher = null;
      });
    } catch (e) {
      this.logger.warn(`Could not watch STEERING.md: ${e}`);
    }
  }

  /** Periodic check to recover from file deletions or watcher failures. */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      // Re-ensure the file exists (agent may have deleted it)
      if (!existsSync(this.steeringPath)) {
        this.ensureFile();
      }
      // Re-attach watcher if it died
      if (!this.fileWatcher) {
        this.startWatching();
      }
      this.refreshCount();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private readonly ENTRY_REGEX = /^- \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] /gm;

  private refreshCount(): void {
    try {
      if (!existsSync(this.steeringPath)) {
        this.updateCount(0);
        return;
      }
      const content = readFileSync(this.steeringPath, 'utf8');
      const matches = content.match(this.ENTRY_REGEX);
      this.updateCount(matches ? matches.length : 0);
    } catch (e) {
      // Ignore read errors gracefully
    }
  }

  private updateCount(newCount: number): void {
    if (this.currentCount !== newCount) {
      this.currentCount = newCount;
      this.count$.next(this.currentCount);
    }
  }

  private async withLock<T>(action: () => Promise<T>): Promise<T> {
    const lockPath = `${this.steeringPath}.lock`;
    const maxRetries = 100; // 10 seconds total
    let acquired = false;
    
    // Clean up stale lock before attempting to acquire
    this.cleanStaleLock(lockPath);

    for (let i = 0; i < maxRetries; i++) {
      try {
        mkdirSync(lockPath);
        acquired = true;
        break;
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          // On first retry, check if the lock is stale (previous process crashed)
          if (i === 0) {
            this.cleanStaleLock(lockPath);
          }
          await new Promise((r) => setTimeout(r, 100)); // wait and retry
        } else {
          throw err;
        }
      }
    }

    if (!acquired) {
      this.logger.warn(`Failed to acquire lock for STEERING.md after 10s. Proceeding unsafely.`);
    }

    try {
      return await action();
    } finally {
      try {
        rmSync(lockPath, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  /** Remove a lock directory that's older than STALE_LOCK_AGE_MS (crash recovery). */
  private cleanStaleLock(lockPath: string): void {
    try {
      if (!existsSync(lockPath)) return;
      const stat = statSync(lockPath);
      const age = Date.now() - stat.mtimeMs;
      if (age > STALE_LOCK_AGE_MS) {
        rmSync(lockPath, { recursive: true, force: true });
        this.logger.warn(`Cleaned up stale STEERING.md lock (age: ${Math.round(age / 1000)}s)`);
      }
    } catch {
      // ignore
    }
  }
}
