import { open, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { encryptData } from '../crypto/crypto.util';

/**
 * Chains writes per file so rapid mutations serialize to disk in order
 * without overlapping writeFile calls corrupting JSON.
 *
 * When `debounceMs > 0`, rapid `schedule()` calls are coalesced into one
 * write after the debounce window (like AsyncJsonWriter), while still using
 * safe atomic temp-rename under the hood.
 */
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

  /**
   * Schedule a write.
   * - When `debounceMs > 0`: debounces — multiple rapid calls coalesce into one.
   * - When `debounceMs === 0`: chains immediately (original behaviour).
   */
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

  /**
   * Flush any pending write immediately and wait for it to complete.
   * Cancels the debounce timer when in debounce mode, then writes in-line.
   */
  flush(): Promise<void> {
    if (this.debounceMs > 0 && this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.enqueueWrite();
    }
    return this.chain;
  }

  /**
   * Cancel any pending debounced write.
   * Call from `onModuleDestroy` after `flush()` to avoid stale timer fires.
   */
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
    const dataToWrite = this.encryptionKey ? encryptData(json, this.encryptionKey) : json;
    await this.writeAtomically(dataToWrite);
  }

  private nextTempPath(): string {
    const dir = dirname(this.filePath);
    const file = basename(this.filePath);
    this.writeCounter += 1;
    return join(dir, `.${file}.${process.pid}.${Date.now()}.${this.writeCounter}.tmp`);
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
        try { await handle.close(); } catch { /* ignore close errors */ }
      }
      try { await unlink(tempPath); } catch { /* ignore cleanup errors */ }
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
        try { await handle.close(); } catch { /* ignore close errors */ }
      }
    }
  }
}
