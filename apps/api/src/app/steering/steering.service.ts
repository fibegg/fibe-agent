import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { resolve, join } from 'node:path';
import { Subject } from 'rxjs';
import { ConfigService } from '../config/config.service';

export interface QueuedMessage {
  text: string;
  timestamp: string;
}

@Injectable()
export class SteeringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SteeringService.name);
  private readonly steeringPath: string;
  
  public readonly count$ = new Subject<number>();
  private readonly queue: string[] = [];

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getDataDir();
    this.steeringPath = resolve(join(dataDir, 'STEERING.md'));
  }

  onModuleInit(): void {
    this.count$.next(0);
  }

  onModuleDestroy(): void {
    // Cleanup if needed
  }

  get path(): string {
    return this.steeringPath; // Keeping for compatibility if requested
  }

  get count(): number {
    return this.queue.length;
  }

  async enqueue(text: string): Promise<QueuedMessage> {
    if (!text || !text.trim()) {
      throw new Error('Cannot enqueue empty message');
    }

    const trimmed = text.trim();
    this.queue.push(trimmed);
    this.logger.log(`Enqueued steering message: ${trimmed.slice(0, 80)}`);
    
    this.count$.next(this.queue.length);
    
    return {
      text: trimmed,
      timestamp: new Date().toISOString(),
    };
  }

  drain(): string[] {
    const messages = [...this.queue];
    this.queue.length = 0;
    this.count$.next(0);
    return messages;
  }

  /** Reset the queue. */
  async resetQueue(): Promise<void> {
    this.queue.length = 0;
    this.count$.next(0);
  }

  async awaitPendingWrites(): Promise<void> {
    return Promise.resolve();
  }
}
