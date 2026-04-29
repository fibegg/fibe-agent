import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SteeringService } from './steering.service';

describe('SteeringService', () => {
  let dataDir: string;
  let service: SteeringService;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'steering-'));
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined } as never;
    service = new SteeringService(config);
    service.onModuleInit();
  });

  afterEach(async () => {
    service.onModuleDestroy();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('enqueue adds a message to the queue', async () => {
    await service.enqueue('fix the typo');
    expect(service.count).toBe(1);
    
    const messages = service.drain();
    expect(messages).toEqual(['fix the typo']);
    expect(service.count).toBe(0);
  });

  test('enqueue multiple messages preserves order', async () => {
    await service.enqueue('first');
    await service.enqueue('second');
    await service.enqueue('third');
    expect(service.count).toBe(3);
    
    const messages = service.drain();
    expect(messages).toEqual(['first', 'second', 'third']);
  });

  test('resetQueue clears the queue and count', async () => {
    await service.enqueue('message A');
    await service.enqueue('message B');
    
    await service.resetQueue();
    expect(service.count).toBe(0);
    
    const messages = service.drain();
    expect(messages).toEqual([]);
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

  test('enqueue rejects empty text', async () => {
    await expect(service.enqueue('')).rejects.toThrow('Cannot enqueue empty message');
    await expect(service.enqueue('   ')).rejects.toThrow('Cannot enqueue empty message');
    expect(service.count).toBe(0);
  });

  test('enqueue trims whitespace from text', async () => {
    await service.enqueue('  hello world  ');
    const messages = service.drain();
    expect(messages).toEqual(['hello world']);
  });
});
