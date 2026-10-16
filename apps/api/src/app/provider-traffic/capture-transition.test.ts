import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failStart = false;
let failStop = false;
let failCertificate = false;
let starts = 0;
let cleanups = 0;
mock.module('./certificate-manager', () => ({
  CertificateManager: class {
    static cleanupStale() {
      return undefined;
    }
    constructor() {
      if (failCertificate) throw new Error('certificate failure');
    }
    getCaCertPath() {
      return '/synthetic/ca.pem';
    }
    cleanup() {
      cleanups++;
    }
  },
}));
mock.module('./connect-proxy', () => ({
  ConnectProxy: class {
    async start() {
      starts++;
      if (failStart) throw new Error('listen failure');
      return 12345;
    }
    async stop() {
      if (failStop) throw new Error('close failure');
    }
  },
}));
const { ProxyService } = await import('./proxy.service');
const { FibeSyncSettingsController } = await import(
  '../fibe-sync/fibe-sync-settings.controller'
);
const { FibeSyncSettingsStoreService } = await import(
  '../fibe-sync/fibe-sync-settings-store.service'
);

let proxy: InstanceType<typeof ProxyService>;
let dataDir: string;
let originalPort: string | undefined;
let originalCa: string | undefined;
beforeEach(() => {
  originalPort = process.env.__FIBE_PROXY_PORT;
  originalCa = process.env.__FIBE_PROXY_CA_PATH;
  delete process.env.__FIBE_PROXY_PORT;
  delete process.env.__FIBE_PROXY_CA_PATH;
  failStart = failStop = failCertificate = false;
  starts = cleanups = 0;
  dataDir = mkdtempSync(join(tmpdir(), 'capture-transition-'));
  proxy = new ProxyService({
    append() {
      return undefined;
    },
  } as never);
});
afterEach(async () => {
  failStop = false;
  await proxy.onModuleDestroy();
  if (originalPort === undefined) delete process.env.__FIBE_PROXY_PORT;
  else process.env.__FIBE_PROXY_PORT = originalPort;
  if (originalCa === undefined) delete process.env.__FIBE_PROXY_CA_PATH;
  else process.env.__FIBE_PROXY_CA_PATH = originalCa;
  rmSync(dataDir, { recursive: true, force: true });
});
function store() {
  return new FibeSyncSettingsStoreService({
    getConversationDataDir: () => dataDir,
    isFibeSyncEnabled: () => false,
  } as never);
}

test('failed listener startup cleans resources and the identical PATCH retries', async () => {
  const settings = store();
  const controller = new FibeSyncSettingsController(settings, proxy);
  failStart = true;
  await expect(
    controller.updateSettings({ rawProviderCapture: true }),
  ).rejects.toThrow('listen failure');
  expect(settings.get().rawProviderCapture).toBe(false);
  expect(proxy.isEnabled()).toBe(false);
  expect(process.env.__FIBE_PROXY_PORT).toBeUndefined();
  expect(cleanups).toBe(1);
  failStart = false;
  expect(
    (await controller.updateSettings({ rawProviderCapture: true }))
      .rawProviderCapture,
  ).toBe(true);
  expect(starts).toBe(2);
  expect(proxy.isEnabled()).toBe(true);
});

test('certificate failure leaves capture disabled and a subsequent request can succeed', async () => {
  failCertificate = true;
  await expect(proxy.setCaptureEnabled(true)).rejects.toThrow(
    'certificate failure',
  );
  expect(proxy.isEnabled()).toBe(false);
  expect(process.env.__FIBE_PROXY_CA_PATH).toBeUndefined();
  failCertificate = false;
  await proxy.setCaptureEnabled(true);
  expect(proxy.isEnabled()).toBe(true);
});

test('enable/disable requests serialize; failed stop retains effective state for retry', async () => {
  const settings = store();
  const controller = new FibeSyncSettingsController(settings, proxy);
  await Promise.all([
    controller.updateSettings({ rawProviderCapture: true }),
    controller.updateSettings({ rawProviderCapture: false }),
  ]);
  expect(settings.get().rawProviderCapture).toBe(false);
  expect(proxy.isEnabled()).toBe(false);
  await controller.updateSettings({ rawProviderCapture: true });
  failStop = true;
  await expect(
    controller.updateSettings({ rawProviderCapture: false }),
  ).rejects.toThrow('close failure');
  expect(settings.get().rawProviderCapture).toBe(true);
  expect(proxy.isEnabled()).toBe(true);
  expect(process.env.__FIBE_PROXY_PORT).toBe('12345');
  failStop = false;
  await controller.updateSettings({ rawProviderCapture: false });
  expect(proxy.isEnabled()).toBe(false);
  expect(settings.get().rawProviderCapture).toBe(false);
});

test('persistence failure does not change memory and rolls back the effective proxy', async () => {
  const settings = store();
  mkdirSync(join(dataDir, 'fibe-sync-settings.json'));
  const controller = new FibeSyncSettingsController(settings, proxy);
  await expect(
    controller.updateSettings({ rawProviderCapture: true }),
  ).rejects.toThrow();
  expect(settings.get().rawProviderCapture).toBe(false);
  expect(proxy.isEnabled()).toBe(false);
  expect(process.env.__FIBE_PROXY_PORT).toBeUndefined();
});

test('saved enabled preference retries a failed bootstrap without toggling the saved bit', async () => {
  const settings = store();
  settings.update({ rawProviderCapture: true });
  proxy = new ProxyService(
    {
      append() {
        return undefined;
      },
    } as never,
    settings,
  );
  failStart = true;
  await expect(proxy.onModuleInit()).rejects.toThrow('listen failure');
  expect(settings.get().rawProviderCapture).toBe(true);
  expect(proxy.isEnabled()).toBe(false);
  failStart = false;
  await new FibeSyncSettingsController(settings, proxy).updateSettings({
    rawProviderCapture: true,
  });
  expect(proxy.isEnabled()).toBe(true);
});

test('destroy prevents queued or subsequent enables from reopening the proxy', async () => {
  const enable = proxy.setCaptureEnabled(true);
  const destroy = proxy.onModuleDestroy();
  await expect(enable).rejects.toThrow('shutting down');
  await destroy;
  await expect(proxy.setCaptureEnabled(true)).rejects.toThrow('shutting down');
  expect(proxy.isEnabled()).toBe(false);
});
