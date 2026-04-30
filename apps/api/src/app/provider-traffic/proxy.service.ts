import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { CertificateManager } from './certificate-manager';
import { ConnectProxy } from './connect-proxy';
import { ProviderTrafficStoreService } from './provider-traffic-store.service';
import { FibeSyncSettingsStoreService } from '../fibe-sync/fibe-sync-settings-store.service';

/**
 * Orchestrates the MITM proxy lifecycle. Only starts if the
 * `PROVIDER_TRAFFIC_CAPTURE` env var is set to `'true'`.
 *
 * On startup it:
 * 1. Cleans up stale CA cert files from crashed previous processes
 * 2. Generates a self-signed CA and writes it to a temp file
 * 3. Starts an HTTP CONNECT proxy on an ephemeral localhost port
 * 4. Publishes the port and CA path via `process.env` so that
 *    strategies can inject them into spawned CLI processes
 *
 * On shutdown it stops the proxy and deletes the temp CA file.
 */
@Injectable()
export class ProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ProxyService');
  private certManager: CertificateManager | null = null;
  private proxy: ConnectProxy | null = null;
  private enabled = false;

  constructor(
    private readonly trafficStore: ProviderTrafficStoreService,
    @Optional() private readonly settingsStore?: FibeSyncSettingsStoreService
  ) {}

  async onModuleInit(): Promise<void> {
    const captureEnabled = this.settingsStore?.get().rawProviderCapture ?? process.env['PROVIDER_TRAFFIC_CAPTURE'] === 'true';
    if (!captureEnabled) {
      this.logger.log('Provider traffic capture is disabled (set PROVIDER_TRAFFIC_CAPTURE=true to enable)');
      return;
    }

    await this.startCapture();
  }

  async setCaptureEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      await this.startCapture();
    } else {
      await this.stopCapture();
    }
  }

  private async startCapture(): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;
    this.logger.log('Initializing MITM provider traffic capture...');

    // Clean up orphaned CA files from previous crashed processes
    CertificateManager.cleanupStale();

    const maxBodySize = parseInt(process.env['PROVIDER_TRAFFIC_MAX_BODY_SIZE'] ?? '', 10) || undefined;
    const redactBodies = process.env['PROVIDER_TRAFFIC_REDACT_BODIES'] === 'true';

    this.certManager = new CertificateManager();

    this.proxy = new ConnectProxy({
      certManager: this.certManager,
      onCapturedRequest: (record) => {
        this.logger.debug(
          `Captured ${record.request.method} ${record.request.url} → ${record.response.statusCode} (${record.durationMs}ms)`
        );
        this.trafficStore.append(record);
      },
      maxBodySize,
      redactBodies,
    });

    const port = await this.proxy.start();

    // Publish for strategies to pick up via getProxyEnv()
    process.env['__FIBE_PROXY_PORT'] = String(port);
    process.env['__FIBE_PROXY_CA_PATH'] = this.certManager.getCaCertPath();

    this.logger.log(
      `MITM proxy active on 127.0.0.1:${port} — CA cert at ${this.certManager.getCaCertPath()}`
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopCapture();
  }

  private async stopCapture(): Promise<void> {
    if (!this.enabled) return;

    this.logger.log('Shutting down MITM proxy...');
    this.enabled = false;

    delete process.env['__FIBE_PROXY_PORT'];
    delete process.env['__FIBE_PROXY_CA_PATH'];

    if (this.proxy) {
      await this.proxy.stop();
      this.proxy = null;
    }

    if (this.certManager) {
      this.certManager.cleanup();
      this.certManager = null;
    }

    this.logger.log('MITM proxy shut down.');
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
