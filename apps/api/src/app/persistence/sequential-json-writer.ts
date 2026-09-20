import { open, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { encryptData } from '../crypto/crypto.util';

/** Serializes atomic JSON writes, optionally coalescing them behind a debounce. */
export class SequentialJsonWriter {
  private chain: Promise<void> = Promise.resolve();
  private writeCounter = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly getSnapshot: () => unknown,
    private readonly encryptionKey?: string,
    private readonly debounceMs = 0,
  ) {}

  /** Schedules an immediate chained write or a debounced one. */
  schedule(): void {
    if (this.debounceMs > 0) {
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.enqueueWrite();
      }, this.debounceMs);
    } else {
      this.enqueueWrite();
    }
  }

  /** Flushes and waits for pending writes. */
  flush(): Promise<void> {
    if (this.debounceMs > 0 && this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.enqueueWrite();
    }
    return this.chain;
  }

  /** Cancels a pending debounce after the final flush. */
  destroy(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private enqueueWrite(): void {
    this.chain = this.chain
      .then(() => this.writeSnapshot())
      .catch((err) => {
        console.error('SequentialJsonWriter failed:', err);
      });
  }

  private async writeSnapshot(): Promise<void> {
    const json = JSON.stringify(this.getSnapshot(), null, 2);
    const dataToWrite = this.encryptionKey
      ? encryptData(json, this.encryptionKey)
      : json;
    await this.writeAtomically(dataToWrite);
  }

  private nextTempPath(): string {
    const dir = dirname(this.filePath);
    const file = basename(this.filePath);
    this.writeCounter += 1;
    return join(
      dir,
      `.${file}.${process.pid}.${Date.now()}.${this.writeCounter}.tmp`,
    );
  }

  private async writeAtomically(data: string): Promise<void> {
    const tempPath = this.nextTempPath();
    let handle: Awaited<ReturnType<typeof open>> | undefined;

    try {
      handle = await open(tempPath, 'wx', 0o600);
      await handle.writeFile(data, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;

      await rename(tempPath, this.filePath);
      await this.syncDirectory(dirname(this.filePath));
    } catch (err) {
      if (handle) {
        try {
          await handle.close();
        } catch {
          /* ignore close errors */
        }
      }
      try {
        await unlink(tempPath);
      } catch {
        /* ignore cleanup errors */
      }
      throw err;
    }
  }

  private async syncDirectory(dir: string): Promise<void> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(dir, 'r');
      await handle.sync();
    } catch {
      /* Best-effort: some filesystems do not allow fsync on directories. */
    } finally {
      if (handle) {
        try {
          await handle.close();
        } catch {
          /* ignore close errors */
        }
      }
    }
  }
}
