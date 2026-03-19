import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';

export interface QueuedMessage {
  text: string;
  timestamp: string;
}

const STEERING_HEADER = '# Player Messages (read & clear this file)\n\n';

@Injectable()
export class SteeringService implements OnModuleInit {
  private readonly logger = new Logger(SteeringService.name);
  private readonly steeringPath: string;
  private queue: QueuedMessage[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getConversationDataDir();
    this.steeringPath = join(dataDir, 'STEERING.md');
  }

  onModuleInit(): void {
    this.ensureFile();
  }

  get path(): string {
    return this.steeringPath;
  }

  get count(): number {
    return this.queue.length;
  }

  enqueue(text: string): QueuedMessage {
    const entry: QueuedMessage = {
      text,
      timestamp: new Date().toISOString(),
    };
    this.queue.push(entry);
    this.logger.log(`Queued message (${this.queue.length} pending): ${text.slice(0, 80)}`);
    this.scheduleWrite();
    return entry;
  }

  /** Reset the in-memory queue (e.g. at the start of a new streaming session).
   *  Does NOT touch STEERING.md — the agent reads and clears that file itself. */
  resetQueue(): void {
    this.queue = [];
  }

  private ensureFile(): void {
    const dataDir = this.config.getConversationDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    if (!existsSync(this.steeringPath)) {
      writeFileSync(this.steeringPath, '');
      this.logger.log(`Created STEERING.md at ${this.steeringPath}`);
    }
  }

  private scheduleWrite(): void {
    this.writeChain = this.writeChain.then(() => this.writeSteering()).catch(() => { /* ignore write errors */ });
  }

  private async writeSteering(): Promise<void> {
    const lines = this.queue
      .map((m) => `- [${m.timestamp}] ${m.text}`)
      .join('\n');
    await writeFile(this.steeringPath, this.queue.length > 0 ? `${STEERING_HEADER}${lines}\n` : '');
  }
}
