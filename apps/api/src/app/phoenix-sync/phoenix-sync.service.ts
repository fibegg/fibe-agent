import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Injectable()
export class PhoenixSyncService {
  private readonly logger = new Logger(PhoenixSyncService.name);

  constructor(private readonly config: ConfigService) {}

  async syncMessages(content: string): Promise<void> {
    await this.sync('messages', content);
  }

  async syncActivity(content: string): Promise<void> {
    await this.sync('activity', content);
  }

  private async sync(
    type: 'messages' | 'activity',
    content: string
  ): Promise<void> {
    if (!this.config.isPhoenixSyncEnabled()) return;

    const apiUrl = this.config.getPhoenixApiUrl();
    const apiKey = this.config.getPhoenixApiKey();
    const agentId = this.config.getPhoenixAgentId();

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
          `Phoenix sync ${type} failed: ${res.status} ${res.statusText}`
        );
      }
    } catch (err) {
      this.logger.warn(`Phoenix sync ${type} error: ${err}`);
    }
  }
}
