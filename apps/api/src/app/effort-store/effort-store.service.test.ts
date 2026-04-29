import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EffortStoreService } from './effort-store.service';

describe('EffortStoreService', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'effort-store-'));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    rmSync(dataDir, { recursive: true, force: true });
  });

  function makeConfig(defaultEffort = 'max') {
    return {
      getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined,
      getDefaultEffort: () => defaultEffort,
    };
  }

  test('get returns default effort when no file exists', () => {
    const service = new EffortStoreService(makeConfig('high') as never);
    expect(service.get()).toBe('high');
  });

  test('set then get returns normalized value', () => {
    const service = new EffortStoreService(makeConfig() as never);
    expect(service.set('  XHIGH  ')).toBe('xhigh');
    expect(service.get()).toBe('xhigh');
  });

  test('set falls back to default for invalid values', () => {
    const service = new EffortStoreService(makeConfig('medium') as never);
    expect(service.set('invalid')).toBe('medium');
    expect(service.get()).toBe('medium');
  });

  test('flush persists effort.json immediately', async () => {
    const service = new EffortStoreService(makeConfig() as never);

    service.set('low');
    await service.flush();

    const raw = readFileSync(join(dataDir, 'effort.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ effort: 'low' });
  });

  test('onModuleDestroy flushes pending effort writes', async () => {
    const service = new EffortStoreService(makeConfig() as never);

    service.set('high');
    await service.onModuleDestroy();

    const raw = readFileSync(join(dataDir, 'effort.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ effort: 'high' });
  });
});
