import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { CertificateManager } from './certificate-manager';
import { ConnectProxy } from './connect-proxy';
import { ProviderTrafficStoreService } from './provider-traffic-store.service';
import { FibeSyncSettingsStoreService } from '../fibe-sync/fibe-sync-settings-store.service';

/** Manages the optional local provider-traffic proxy and its temporary CA. */
@Injectable()
export class ProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ProxyService');
  private certManager: CertificateManager | null = null;
  private proxy: ConnectProxy | null = null;
  private enabled = false;
  private destroyed = false;
  private transition: Promise<void> = Promise.resolve();

  constructor(
    private readonly trafficStore: ProviderTrafficStoreService,
    @Optional() private readonly settingsStore?: FibeSyncSettingsStoreService,
  ) {}

  async onModuleInit(): Promise<void> {
    const captureEnabled =
      this.settingsStore?.get().rawProviderCapture ??
      process.env['PROVIDER_TRAFFIC_CAPTURE'] === 'true';
    if (!captureEnabled) {
      this.logger.log(
        'Provider traffic capture is disabled (set PROVIDER_TRAFFIC_CAPTURE=true to enable)',
      );
      return;
    }

    await this.setCaptureEnabled(true);
  }

  async setCaptureEnabled(enabled: boolean): Promise<void> {
    const operation = this.transition.then(() => {
      if (enabled && this.destroyed)
        throw new Error('Provider capture is shutting down');
      return enabled ? this.startCapture() : this.stopCapture();
    });
    this.transition = operation.catch(() => undefined);
    return operation;
  }

  private async startCapture(): Promise<void> {
    if (this.enabled) return;
    // Failed starts may still own resources whose cleanup must be retried.
    if (this.proxy || this.certManager) await this.stopCapture();
    this.logger.log('Initializing MITM provider traffic capture...');

    CertificateManager.cleanupStale();

    const maxBodySize =
      parseInt(process.env['PROVIDER_TRAFFIC_MAX_BODY_SIZE'] ?? '', 10) ||
      undefined;
    const redactBodies =
      process.env['PROVIDER_TRAFFIC_REDACT_BODIES'] === 'true';

    try {
      this.certManager = new CertificateManager();

      this.proxy = new ConnectProxy({
        certManager: this.certManager,
        onCapturedRequest: (record, conversationId) => {
          this.logger.debug(
            `Captured ${record.request.method} ${record.request.url} → ${record.response.statusCode} (${record.durationMs}ms)`,
          );
          this.trafficStore.append(record, conversationId);
        },
        maxBodySize,
        redactBodies,
      });

      const port = await this.proxy.start();

      const caPath = this.certManager.getCaCertPath();
      process.env['__FIBE_PROXY_PORT'] = String(port);
      process.env['__FIBE_PROXY_CA_PATH'] = caPath;
      this.enabled = true;

      this.logger.log(
        `MITM proxy active on 127.0.0.1:${port}: CA cert at ${this.certManager.getCaCertPath()}`,
      );
    } catch (error) {
      // Retain references if cleanup itself fails so a later request can retry it.
      try {
        await this.stopCapture();
      } catch {
        /* The failed transition remains failed. */
      }
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    await this.setCaptureEnabled(false);
  }

  private async stopCapture(): Promise<void> {
    if (!this.enabled && !this.proxy && !this.certManager) return;

    this.logger.log('Shutting down MITM proxy...');
    if (this.proxy) {
      await this.proxy.stop();
      this.proxy = null;
    }
    this.enabled = false;
    delete process.env['__FIBE_PROXY_PORT'];
    delete process.env['__FIBE_PROXY_CA_PATH'];

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
