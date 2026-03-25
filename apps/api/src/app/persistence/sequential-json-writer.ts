import { writeFile } from 'node:fs/promises';
import { encryptData } from '../crypto/crypto.util';

/**
 * Chains writes per file so rapid mutations serialize to disk in order
 * without overlapping writeFile calls corrupting JSON.
 */
export class SequentialJsonWriter {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly getSnapshot: () => unknown,
    private readonly encryptionKey?: string
  ) {}

  schedule(): void {
    this.chain = this.chain
      .then(async () => {
        const json = JSON.stringify(this.getSnapshot(), null, 2);
        const dataToWrite = this.encryptionKey ? encryptData(json, this.encryptionKey) : json;
        await writeFile(this.filePath, dataToWrite);
      })
      .catch((err) => {
        console.error('SequentialJsonWriter failed:', err);
      });
  }
}
