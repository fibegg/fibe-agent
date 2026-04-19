import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProxyService } from './proxy.service';
import { ProviderTrafficStoreService } from './provider-traffic-store.service';

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'proxy-service-'));
}

function makeConfig(dataDir: string) {
  return {
    getDataDir: () => dataDir,
    getConversationDataDir: () => dataDir,
    getEncryptionKey: (): string | undefined => undefined,
  } as never;
}

function makeFibeSync() {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  return { syncRawProviders: () => {} } as never;
}

describe('ProxyService', () => {
  let dataDir: string;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    dataDir = tmpDir();
    // Save and clean relevant env vars
    for (const key of ['PROVIDER_TRAFFIC_CAPTURE', '__FIBE_PROXY_PORT', '__FIBE_PROXY_CA_PATH']) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(async () => {
    // Restore env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((r) => setTimeout(r, 50));
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('does not start proxy when PROVIDER_TRAFFIC_CAPTURE is not set', async () => {
    const store = new ProviderTrafficStoreService(makeConfig(dataDir), makeFibeSync());
    const service = new ProxyService(store);

    await service.onModuleInit();

    expect(service.isEnabled()).toBe(false);
    expect(process.env['__FIBE_PROXY_PORT']).toBeUndefined();
    expect(process.env['__FIBE_PROXY_CA_PATH']).toBeUndefined();

    await service.onModuleDestroy();
  });

  test('starts proxy when PROVIDER_TRAFFIC_CAPTURE=true', async () => {
    process.env['PROVIDER_TRAFFIC_CAPTURE'] = 'true';

    const store = new ProviderTrafficStoreService(makeConfig(dataDir), makeFibeSync());
    const service = new ProxyService(store);

    await service.onModuleInit();

    expect(service.isEnabled()).toBe(true);
    expect(process.env['__FIBE_PROXY_PORT']).toBeDefined();
    expect(parseInt(process.env['__FIBE_PROXY_PORT'] ?? '0', 10)).toBeGreaterThan(0);
    expect(process.env['__FIBE_PROXY_CA_PATH']).toBeDefined();
    expect(process.env['__FIBE_PROXY_CA_PATH']).toContain('fibe-proxy-ca-');

    await service.onModuleDestroy();

    expect(process.env['__FIBE_PROXY_PORT']).toBeUndefined();
    expect(process.env['__FIBE_PROXY_CA_PATH']).toBeUndefined();
  });

  test('does not start proxy when PROVIDER_TRAFFIC_CAPTURE=false', async () => {
    process.env['PROVIDER_TRAFFIC_CAPTURE'] = 'false';

    const store = new ProviderTrafficStoreService(makeConfig(dataDir), makeFibeSync());
    const service = new ProxyService(store);

    await service.onModuleInit();

    expect(service.isEnabled()).toBe(false);
    expect(process.env['__FIBE_PROXY_PORT']).toBeUndefined();

    await service.onModuleDestroy();
  });
});
