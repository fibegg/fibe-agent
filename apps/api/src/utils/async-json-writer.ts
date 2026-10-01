import { writeFile } from 'node:fs/promises';

export interface AsyncJsonWriterOptions<T> {
  filePath: string;
  getData: () => T;
  /** Optional encryption key: reserved for future use; currently unused. */
  encryptionKey?: string | undefined;
  /** Debounce delay in ms (default 200). */
  debounceMs?: number;
}

/** Coalesces scheduled JSON writes behind a debounce. */
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

  /** Schedules a debounced write. */
  schedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      // Swallow errors from the background write: flush() is used when durability matters.
      void this.write().catch(() => {
        /* ignore */
      });
    }, this.debounceMs);
  }

  /** Cancels a pending timer after the final flush. */
  destroy(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Writes immediately and waits for completion. */
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
