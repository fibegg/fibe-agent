import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EffortStoreService } from './effort-store.service';

describe('EffortStoreService', () => {
  let dataDir: string;
  let services: EffortStoreService[];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'effort-store-'));
    services = [];
  });

  afterEach(async () => {
    await Promise.all(services.map((service) => service.onModuleDestroy()));
    rmSync(dataDir, { recursive: true, force: true });
  });

  function makeConfig(defaultEffort = 'max') {
    return {
      getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined,
      getDefaultEffort: () => defaultEffort,
    };
  }

  function makeService(defaultEffort = 'max') {
    const service = new EffortStoreService(makeConfig(defaultEffort) as never);
    services.push(service);
    return service;
  }

  test('get returns default effort when no file exists', () => {
    const service = makeService('high');
    expect(service.get()).toBe('high');
  });

  test('set then get returns normalized value', () => {
    const service = makeService();
    expect(service.set('  XHIGH  ')).toBe('xhigh');
    expect(service.get()).toBe('xhigh');
  });

  test('set falls back to default for invalid values', () => {
    const service = makeService('medium');
    expect(service.set('invalid')).toBe('medium');
    expect(service.get()).toBe('medium');
  });

  test('flush persists effort.json immediately', async () => {
    const service = makeService();

    service.set('low');
    await service.flush();

    const raw = readFileSync(join(dataDir, 'effort.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ effort: 'low' });
  });

  test('onModuleDestroy flushes pending effort writes', async () => {
    const service = makeService();

    service.set('high');
    await service.onModuleDestroy();

    const raw = readFileSync(join(dataDir, 'effort.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ effort: 'high' });
  });
});
