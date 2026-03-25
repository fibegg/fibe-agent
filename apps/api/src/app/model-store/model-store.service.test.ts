import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelStoreService } from './model-store.service';

describe('ModelStoreService', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'model-store-'));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('get returns default model when no file', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getDefaultModel: () => 'flash', getEncryptionKey: () => undefined };
    const service = new ModelStoreService(config as never);
    expect(service.get()).toBe('flash');
  });

  test('get returns default when stored value is empty', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getDefaultModel: () => 'flash', getEncryptionKey: () => undefined };
    const service = new ModelStoreService(config as never);
    service.set('');
    expect(service.get()).toBe('flash');
  });

  test('set then get returns value', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getDefaultModel: () => '', getEncryptionKey: () => undefined };
    const service = new ModelStoreService(config as never);
    expect(service.set('gemini-1.5')).toBe('gemini-1.5');
    expect(service.get()).toBe('gemini-1.5');
  });

  test('set trims value', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getDefaultModel: () => '', getEncryptionKey: () => undefined };
    const service = new ModelStoreService(config as never);
    expect(service.set('  x  ')).toBe('x');
    expect(service.get()).toBe('x');
  });

  test('get uses cache after first read', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getDefaultModel: () => '', getEncryptionKey: () => undefined };
    const service = new ModelStoreService(config as never);
    service.set('cached');
    expect(service.get()).toBe('cached');
    expect(service.get()).toBe('cached');
  });
});
