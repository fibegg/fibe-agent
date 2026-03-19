import { writeFile } from 'node:fs/promises';

/**
 * Chains writes per file so rapid mutations serialize to disk in order
 * without overlapping writeFile calls corrupting JSON.
 */
export class SequentialJsonWriter {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly getSnapshot: () => unknown
  ) {}

  schedule(): void {
    this.chain = this.chain
      .then(async () => {
        await writeFile(
          this.filePath,
          JSON.stringify(this.getSnapshot(), null, 2)
        );
      })
      .catch(() => undefined);
  }
}
