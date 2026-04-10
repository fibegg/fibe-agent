import { Injectable } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';

@Injectable()
export class AuditService {
  private readonly logPath: string;

  constructor(private readonly config: ConfigService) {
    this.logPath = join(this.config.getConversationDataDir(), 'audit.log');
  }

  async logEvent(action: string, resource: string, actor: string, details?: Record<string, unknown>): Promise<void> {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      resource,
      actor,
      ...(details ? { details } : {})
    };
    
    try {
      const dir = this.config.getConversationDataDir();
      try {
        await mkdir(dir, { recursive: true });
      } catch {
        // ignore
      }
      await appendFile(this.logPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      console.error('Failed to write to audit log:', err);
    }
  }
}
