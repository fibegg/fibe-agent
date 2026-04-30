import { writeFile } from 'node:fs/promises';

export interface AsyncJsonWriterOptions<T> {
  /** Absolute path to write. */
  filePath: string;
  /** Returns the current data to serialize. */
  getData: () => T;
  /** Optional encryption key — reserved for future use; currently unused. */
  encryptionKey?: string | undefined;
  /** Debounce delay in ms (default 200). */
  debounceMs?: number;
}

/**
 * Debounced, coalescing async JSON writer.
 *
 * - `schedule()` queues a write; multiple rapid calls coalesce into one write.
 * - `flush()` forces an immediate write and waits for it to complete.
 * - `destroy()` cancels any pending scheduled write (call from onModuleDestroy).
 */
export class AsyncJsonWriter<T> {
  private readonly filePath: string;
  private readonly getData: () => T;
  private readonly debounceMs: number;

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AsyncJsonWriterOptions<T>) {
    this.filePath = options.filePath;
    this.getData = options.getData;
    this.debounceMs = options.debounceMs ?? 200;
  }

  /** Schedule a debounced write. Safe to call many times in rapid succession. */
  schedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      // Swallow errors from the background write — flush() is used when durability matters.
      void this.write().catch(() => { /* ignore */ });
    }, this.debounceMs);
  }

  /**
   * Cancel any pending scheduled write.
   * Call from the service's onModuleDestroy after flush() to avoid
   * unhandled errors if the destination is cleaned up before the timer fires.
   */
  destroy(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Flush any pending write immediately and wait for it to complete.
   * Cancels the debounce timer, then writes in-line.
   */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.write();
  }

  private async write(): Promise<void> {
    const data = this.getData();
    const json = JSON.stringify(data, null, 2);
    await writeFile(this.filePath, json, 'utf8');
  }
}
