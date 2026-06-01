import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelStoreService } from './model-store.service';

describe('ModelStoreService', () => {
  let dataDir: string;
  let services: ModelStoreService[];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'model-store-'));
    services = [];
  });

  afterEach(async () => {
    await Promise.all(services.map((service) => service.onModuleDestroy()));
    rmSync(dataDir, { recursive: true, force: true });
  });

  function makeService(defaultModel = '') {
    const config = {
      getDataDir: () => dataDir,
      getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined,
      getDefaultModel: () => defaultModel,
    };
    const service = new ModelStoreService(config as never);
    services.push(service);
    return service;
  }

  test('get returns default model when no file', () => {
    const service = makeService('flash');
    expect(service.get()).toBe('flash');
  });

  test('get returns default when stored value is empty', () => {
    const service = makeService('flash');
    service.set('');
    expect(service.get()).toBe('flash');
  });

  test('set then get returns value', () => {
    const service = makeService();
    expect(service.set('gemini-1.5')).toBe('gemini-1.5');
    expect(service.get()).toBe('gemini-1.5');
  });

  test('set trims value', () => {
    const service = makeService();
    expect(service.set('  x  ')).toBe('x');
    expect(service.get()).toBe('x');
  });

  test('get uses cache after first read', () => {
    const service = makeService();
    service.set('cached');
    expect(service.get()).toBe('cached');
    expect(service.get()).toBe('cached');
  });

  test('flush persists model.json immediately', async () => {
    const service = makeService();

    service.set('gpt-5.4');
    await service.flush();

    const raw = readFileSync(join(dataDir, 'model.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ model: 'gpt-5.4' });
  });

  test('onModuleDestroy flushes pending model writes', async () => {
    const service = makeService();

    service.set('sonnet');
    await service.onModuleDestroy();

    const raw = readFileSync(join(dataDir, 'model.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ model: 'sonnet' });
  });
});
