import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { SequentialJsonWriter } from '../persistence/sequential-json-writer';
import { decryptData } from '../crypto/crypto.util';

@Injectable()
export class ModelStoreService {
  private readonly modelPath: string;
  private readonly jsonWriter: SequentialJsonWriter;
  private cached: string | null = null;

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getConversationDataDir();
    this.modelPath = join(dataDir, 'model.json');
    this.jsonWriter = new SequentialJsonWriter(
      this.modelPath, 
      () => ({ model: this.cached ?? '' }),
      this.config.getEncryptionKey()
    );
    this.ensureDataDir();
  }

  get(): string {
    const stored = this.getStored();
    return stored || this.config.getDefaultModel();
  }

  private getStored(): string {
    if (this.cached !== null) return this.cached;
    if (!existsSync(this.modelPath)) {
      this.cached = '';
      return '';
    }
    try {
      const raw = readFileSync(this.modelPath, 'utf8');
      const decrypted = decryptData(raw, this.config.getEncryptionKey());
      const data = JSON.parse(decrypted);
      this.cached = (data as { model?: string }).model ?? '';
      return this.cached;
    } catch (err) {
      console.error('Failed to parse model load:', err);
      this.cached = '';
      return '';
    }
  }

  set(model: string): string {
    const value = (model ?? '').trim();
    this.cached = value;
    this.jsonWriter.schedule();
    return value;
  }

  private ensureDataDir(): void {
    const dataDir = this.config.getConversationDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }
}
