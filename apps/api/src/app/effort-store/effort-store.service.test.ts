import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  async function disposeFixture() {
    const fixtureDir = dataDir;
    const ownedServices = services;
    await Promise.all(ownedServices.map((service) => service.onModuleDestroy()));
    rmSync(fixtureDir, { recursive: true, force: true });
  }

  afterEach(disposeFixture);

  function makeConfig(defaultEffort = 'max') {
    const fixtureDir = dataDir;
    return {
      getConversationDataDir: () => fixtureDir,
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

  test('delayed fixture disposal flushes its own services and preserves the next fixture', async () => {
    const firstDir = dataDir;
    const firstConfig = makeConfig();
    const first = makeService();
    first.set('high');
    const flush = first.flush.bind(first);
    let releaseFlush!: () => void;
    let firstPersisted: unknown;
    const pendingFlush = new Promise<void>((resolve) => { releaseFlush = resolve; });
    const heldFlush = spyOn(first, 'flush').mockImplementation(async () => {
      await pendingFlush;
      await flush();
      firstPersisted = JSON.parse(readFileSync(join(firstDir, 'effort.json'), 'utf8'));
    });
    const disposal = disposeFixture();

    // Model the runner advancing after a hook timeout without extending its deadline.
    dataDir = mkdtempSync(join(tmpdir(), 'effort-store-'));
    services = [];
    const secondDir = dataDir;
    const second = makeService();
    second.set('low');

    try {
      await second.flush();
      expect(existsSync(firstDir)).toBe(true);
      releaseFlush();
      await disposal;

      expect(firstPersisted).toEqual({ effort: 'high' });
      expect({ firstRemoved: !existsSync(firstDir), secondExists: existsSync(secondDir), firstConfigDir: firstConfig.getConversationDataDir() })
        .toEqual({ firstRemoved: true, secondExists: true, firstConfigDir: firstDir });
      expect(JSON.parse(readFileSync(join(secondDir, 'effort.json'), 'utf8'))).toEqual({ effort: 'low' });
    } finally {
      releaseFlush();
      await disposal;
      heldFlush.mockRestore();
      rmSync(firstDir, { recursive: true, force: true });
    }
  });
});
