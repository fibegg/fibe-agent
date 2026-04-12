import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Injectable()
export class FibeSyncService {
  private readonly logger = new Logger(FibeSyncService.name);
  private messageSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private activitySyncTimer: ReturnType<typeof setTimeout> | null = null;
  private rawProvidersSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DEBOUNCE_MS = 500;

  constructor(private readonly config: ConfigService) {}

  syncMessages(getContent: () => string): void {
    if (this.messageSyncTimer) clearTimeout(this.messageSyncTimer);
    this.messageSyncTimer = setTimeout(() => {
      this.messageSyncTimer = null;
      try {
        void this.sync('messages', getContent());
      } catch (err) {
        this.logger.error(`Error resolving messages content for sync: ${err}`);
      }
    }, FibeSyncService.DEBOUNCE_MS);
  }

  syncActivity(getContent: () => string): void {
    if (this.activitySyncTimer) clearTimeout(this.activitySyncTimer);
    this.activitySyncTimer = setTimeout(() => {
      this.activitySyncTimer = null;
      try {
        void this.sync('activity', getContent());
      } catch (err) {
        this.logger.error(`Error resolving activity content for sync: ${err}`);
      }
    }, FibeSyncService.DEBOUNCE_MS);
  }

  syncRawProviders(getContent: () => string): void {
    if (this.rawProvidersSyncTimer) clearTimeout(this.rawProvidersSyncTimer);
    this.rawProvidersSyncTimer = setTimeout(() => {
      this.rawProvidersSyncTimer = null;
      try {
        void this.sync('raw_providers', getContent());
      } catch (err) {
        this.logger.error(`Error resolving raw_providers content for sync: ${err}`);
      }
    }, FibeSyncService.DEBOUNCE_MS);
  }

  private async sync(
    type: 'messages' | 'activity' | 'raw_providers',
    content: string
  ): Promise<void> {
    if (!this.config.isFibeSyncEnabled()) return;

    const apiUrl = this.config.getFibeApiUrl();
    const apiKey = this.config.getFibeApiKey();
    const agentId = this.config.getFibeAgentId();

    if (!apiUrl || !apiKey || !agentId) return;

    const url = `${apiUrl}/api/agents/${agentId}/${type}`;

    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        this.logger.warn(
          `Fibe sync ${type} failed: ${res.status} ${res.statusText}`
        );
      }
    } catch (err) {
      this.logger.warn(`Fibe sync ${type} error: ${err}`);
    }
  }
}
