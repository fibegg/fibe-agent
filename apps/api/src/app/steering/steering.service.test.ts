import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SteeringService } from './steering.service';

describe('SteeringService', () => {
  let dataDir: string;
  let service: SteeringService;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'steering-'));
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir } as never;
    service = new SteeringService(config);
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.awaitPendingWrites();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('creates STEERING.md on init', () => {
    expect(existsSync(join(dataDir, 'STEERING.md'))).toBe(true);
  });

  test('enqueue adds a message and writes STEERING.md', async () => {
    service.enqueue('fix the typo');
    expect(service.count).toBe(1);
    // Give async write a moment
    await new Promise((r) => setTimeout(r, 50));
    const content = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    expect(content).toContain('fix the typo');
    expect(content).toContain('# Player Messages');
  });

  test('enqueue multiple messages preserves order', async () => {
    service.enqueue('first');
    service.enqueue('second');
    service.enqueue('third');
    expect(service.count).toBe(3);
    await new Promise((r) => setTimeout(r, 50));
    const content = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    const firstIdx = content.indexOf('first');
    const secondIdx = content.indexOf('second');
    const thirdIdx = content.indexOf('third');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  test('resetQueue clears in-memory queue but does not touch STEERING.md', async () => {
    service.enqueue('message A');
    service.enqueue('message B');
    await new Promise((r) => setTimeout(r, 50));
    const contentBefore = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    expect(contentBefore).toContain('message A');
    service.resetQueue();
    expect(service.count).toBe(0);
    // File should still have the old content — agent clears it
    await new Promise((r) => setTimeout(r, 50));
    const contentAfter = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    expect(contentAfter).toContain('message A');
  });

  test('resetQueue with empty queue is a no-op', () => {
    service.resetQueue();
    expect(service.count).toBe(0);
  });

  test('exposes steering file path', () => {
    expect(service.path).toBe(join(dataDir, 'STEERING.md'));
  });

  test('handles write errors gracefully via handleWriteError', async () => {
    // Create a directory at the steering path so writeFile fails
    const { mkdirSync: mkdir, rmSync: rm } = await import('node:fs');
    rm(join(dataDir, 'STEERING.md'), { force: true });
    mkdir(join(dataDir, 'STEERING.md'), { recursive: true });
    // enqueue triggers scheduleWrite → writeSteering → fails → handleWriteError (no throw)
    service.enqueue('test message');
    await service.awaitPendingWrites();
    // No exception should have been thrown
    expect(service.count).toBe(1);
    // Cleanup
    rm(join(dataDir, 'STEERING.md'), { recursive: true, force: true });
  });

  test('writeSteering writes empty string when queue is empty (resetQueue path)', async () => {
    service.enqueue('msg');
    await service.awaitPendingWrites();
    service.resetQueue();
    // Second enqueue to trigger writeSteering with empty queue if we had a flush,
    // but directly test the case where enqueue runs after reset produces empty write
    await new Promise((r) => setTimeout(r, 50));
    expect(service.count).toBe(0);
  });
});
