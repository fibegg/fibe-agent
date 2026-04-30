import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ProxyService } from '../provider-traffic/proxy.service';
import { FibeSyncSettingsStoreService } from './fibe-sync-settings-store.service';
import type { FibeSyncSettings } from './fibe-sync-settings-store.service';

@Controller('fibe-sync-settings')
@UseGuards(AgentAuthGuard)
export class FibeSyncSettingsController {
  constructor(
    private readonly settingsStore: FibeSyncSettingsStoreService,
    private readonly proxyService: ProxyService
  ) {}

  @Get()
  getSettings(): FibeSyncSettings {
    return this.settingsStore.get();
  }

  @Patch()
  async updateSettings(@Body() body: Partial<FibeSyncSettings>): Promise<FibeSyncSettings> {
    const before = this.settingsStore.get();
    const after = this.settingsStore.update(body);

    if (before.rawProviderCapture !== after.rawProviderCapture) {
      await this.proxyService.setCaptureEnabled(after.rawProviderCapture);
    }

    return after;
  }
}
