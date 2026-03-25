import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SteeringService } from './steering.service';

describe('SteeringService', () => {
  let dataDir: string;
  let service: SteeringService;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'steering-'));
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined } as never;
    service = new SteeringService(config);
    service.onModuleInit();
  });

  afterEach(async () => {
    service.onModuleDestroy();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('creates STEERING.md on init', () => {
    expect(existsSync(join(dataDir, 'STEERING.md'))).toBe(true);
  });

  test('enqueue adds a message and writes STEERING.md', async () => {
    await service.enqueue('fix the typo');
    expect(service.count).toBe(1);
    
    const content = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    expect(content).toContain('fix the typo');
    expect(content).toContain('# Player Messages');
  });

  test('enqueue multiple messages preserves order', async () => {
    await service.enqueue('first');
    await service.enqueue('second');
    await service.enqueue('third');
    expect(service.count).toBe(3);
    
    const content = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    const firstIdx = content.indexOf('first');
    const secondIdx = content.indexOf('second');
    const thirdIdx = content.indexOf('third');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  test('resetQueue clears STEERING.md and count', async () => {
    await service.enqueue('message A');
    await service.enqueue('message B');
    
    const contentBefore = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    expect(contentBefore).toContain('message A');
    
    await service.resetQueue();
    expect(service.count).toBe(0);
    
    const contentAfter = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    expect(contentAfter).not.toContain('message A');
    expect(contentAfter).toBe('');
  });

  test('resetQueue with empty queue is a no-op', async () => {
    await service.resetQueue();
    expect(service.count).toBe(0);
  });

  test('exposes steering file path as absolute', () => {
    expect(service.path).toBe(resolve(join(dataDir, 'STEERING.md')));
    // Must be absolute
    expect(service.path.startsWith('/')).toBe(true);
  });

  test('fs.watch updates count when file is changed externally', async () => {
    await service.enqueue('message A');
    expect(service.count).toBe(1);

    // clear file externally
    writeFileSync(join(dataDir, 'STEERING.md'), '');
    
    // wait for watch to trigger
    await new Promise((r) => setTimeout(r, 200));
    expect(service.count).toBe(0);
  });

  test('enqueue rejects empty text', async () => {
    await expect(service.enqueue('')).rejects.toThrow('Cannot enqueue empty message');
    await expect(service.enqueue('   ')).rejects.toThrow('Cannot enqueue empty message');
    expect(service.count).toBe(0);
  });

  test('enqueue trims whitespace from text', async () => {
    await service.enqueue('  hello world  ');
    const content = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    expect(content).toContain('hello world');
    expect(content).not.toContain('  hello world  ');
  });

  test('stale lock is cleaned up automatically', async () => {
    const lockPath = join(dataDir, 'STEERING.md.lock');
    // Create a stale lock (simulate crash)
    mkdirSync(lockPath);
    // Backdate it by changing mtime via touch
    const { utimesSync } = await import('node:fs');
    const oldTime = new Date(Date.now() - 60_000); // 60 seconds ago
    utimesSync(lockPath, oldTime, oldTime);

    // Should still be able to enqueue (stale lock gets cleaned)
    await service.enqueue('after stale lock');
    expect(service.count).toBe(1);
    const content = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    expect(content).toContain('after stale lock');
  });

  test('recovers when STEERING.md is deleted externally', async () => {
    await service.enqueue('will be deleted');
    expect(service.count).toBe(1);

    // Delete the file externally
    rmSync(join(dataDir, 'STEERING.md'), { force: true });
    
    // Wait for health check to recover (health check runs every 5s, but we can trigger manually)
    await new Promise((r) => setTimeout(r, 300));

    // Enqueue should still work (file recreated on write)
    await service.enqueue('after recovery');
    expect(service.count).toBe(1);
    const content = readFileSync(join(dataDir, 'STEERING.md'), 'utf8');
    expect(content).toContain('after recovery');
  });
});
