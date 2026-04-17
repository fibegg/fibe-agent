import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { FibeSyncService } from '../fibe-sync/fibe-sync.service';
import { SequentialJsonWriter } from '../persistence/sequential-json-writer';
import { decryptData } from '../crypto/crypto.util';
import type { CapturedProviderRequest } from './types';

@Injectable()
export class ProviderTrafficStoreService {
  private readonly filePath: string;
  private readonly jsonWriter: SequentialJsonWriter;
  private records: CapturedProviderRequest[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly fibeSync: FibeSyncService
  ) {
    const dataDir = this.config.getConversationDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = join(dataDir, 'raw-providers.json');
    this.jsonWriter = new SequentialJsonWriter(
      this.filePath,
      () => this.records,
      this.config.getEncryptionKey()
    );
    this.records = this.load();
  }

  append(record: CapturedProviderRequest): void {
    this.records.push(record);
    this.jsonWriter.schedule();
    void this.fibeSync.syncRawProviders(() => JSON.stringify(this.records));
  }

  all(): CapturedProviderRequest[] {
    return this.records;
  }

  clear(): void {
    this.records = [];
    this.jsonWriter.schedule();
  }

  private load(): CapturedProviderRequest[] {
    if (!existsSync(this.filePath)) return [];
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const decrypted = decryptData(raw, this.config.getEncryptionKey());
      const data = JSON.parse(decrypted);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Failed to parse raw-providers.json:', err);
      return [];
    }
  }
}
