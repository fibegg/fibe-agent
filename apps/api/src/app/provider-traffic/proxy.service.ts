import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CertificateManager } from './certificate-manager';
import { ConnectProxy } from './connect-proxy';
import { ProviderTrafficStoreService } from './provider-traffic-store.service';

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

  constructor(private readonly trafficStore: ProviderTrafficStoreService) {}

  async onModuleInit(): Promise<void> {
    this.enabled = process.env['PROVIDER_TRAFFIC_CAPTURE'] === 'true';
    if (!this.enabled) {
      this.logger.log('Provider traffic capture is disabled (set PROVIDER_TRAFFIC_CAPTURE=true to enable)');
      return;
    }

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
    if (!this.enabled) return;

    this.logger.log('Shutting down MITM proxy...');

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
