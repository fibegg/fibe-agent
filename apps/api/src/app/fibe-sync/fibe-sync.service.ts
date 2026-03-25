import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Injectable()
export class FibeSyncService {
  private readonly logger = new Logger(FibeSyncService.name);
  private messageSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private activitySyncTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DEBOUNCE_MS = 500;

  constructor(private readonly config: ConfigService) {}

  async syncMessages(content: string): Promise<void> {
    if (this.messageSyncTimer) clearTimeout(this.messageSyncTimer);
    this.messageSyncTimer = setTimeout(() => {
      this.messageSyncTimer = null;
      void this.sync('messages', content);
    }, FibeSyncService.DEBOUNCE_MS);
  }

  async syncActivity(content: string): Promise<void> {
    if (this.activitySyncTimer) clearTimeout(this.activitySyncTimer);
    this.activitySyncTimer = setTimeout(() => {
      this.activitySyncTimer = null;
      void this.sync('activity', content);
    }, FibeSyncService.DEBOUNCE_MS);
  }

  private async sync(
    type: 'messages' | 'activity',
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
