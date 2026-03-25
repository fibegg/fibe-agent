import { Injectable, Logger } from '@nestjs/common';
import { rmSync } from 'node:fs';
import { ConfigService } from '../config/config.service';
import { MessageStoreService } from '../message-store/message-store.service';
import { ActivityStoreService } from '../activity-store/activity-store.service';
import { ModelStoreService } from '../model-store/model-store.service';

@Injectable()
export class DataPrivacyService {
  private readonly logger = new Logger(DataPrivacyService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly messageStore: MessageStoreService,
    private readonly activityStore: ActivityStoreService,
    private readonly modelStore: ModelStoreService
  ) {}

  exportData(): Record<string, unknown> {
    return {
      messages: this.messageStore.all(),
      activities: this.activityStore.all(),
      model: this.modelStore.get(),
      exported_at: new Date().toISOString(),
      agent_id: this.config.getConversationId(),
    };
  }

  deleteData(): void {
    const dataDir = this.config.getConversationDataDir();
    
    // 1. Clear in-memory stores so they don't rewrite to disk
    this.messageStore.clear();
    this.activityStore.clear();
    
    // 2. Erase the directory from disk
    try {
      rmSync(dataDir, { recursive: true, force: true });
      this.logger.log(`Deleted user data directory: ${dataDir}`);
    } catch (err) {
      this.logger.error(`Failed to delete data directory: ${dataDir}`, err);
    }
  }
}
