import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ProxyService } from '../provider-traffic/proxy.service';
import { FibeSyncSettingsStoreService } from './fibe-sync-settings-store.service';
import type { FibeSyncSettings } from './fibe-sync-settings-store.service';

@Controller('fibe-sync-settings')
@UseGuards(AgentAuthGuard)
export class FibeSyncSettingsController {
  private transition: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly settingsStore: FibeSyncSettingsStoreService,
    private readonly proxyService: ProxyService,
  ) {}

  @Get()
  getSettings(): FibeSyncSettings {
    return this.settingsStore.get();
  }

  @Patch()
  async updateSettings(
    @Body() body: Partial<FibeSyncSettings>,
  ): Promise<FibeSyncSettings> {
    const operation = this.transition.then(async () => {
      const before = this.settingsStore.get();
      const desired =
        typeof body.rawProviderCapture === 'boolean'
          ? body.rawProviderCapture
          : before.rawProviderCapture;
      // Reconcile even an unchanged saved bit: a prior startup may have failed.
      await this.proxyService.setCaptureEnabled(desired);
      try {
        return this.settingsStore.update(body);
      } catch (error) {
        try {
          await this.proxyService.setCaptureEnabled(before.rawProviderCapture);
        } catch {
          throw new Error(
            'Capture settings could not be persisted or restored; retry required',
          );
        }
        throw error;
      }
    });
    this.transition = operation.catch(() => undefined);
    return operation;
  }
}
