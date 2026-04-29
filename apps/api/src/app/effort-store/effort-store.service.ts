import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_EFFORT, normalizeEffort, resolveEffort, type EffortValue } from '@shared/effort.constants';
import { ConfigService } from '../config/config.service';
import { decryptData } from '../crypto/crypto.util';
import { SequentialJsonWriter } from '../persistence/sequential-json-writer';

@Injectable()
export class EffortStoreService implements OnModuleDestroy {
  private readonly effortPath: string;
  private readonly jsonWriter: SequentialJsonWriter;
  private cached: EffortValue | '' | null = null;

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getConversationDataDir();
    this.effortPath = join(dataDir, 'effort.json');
    this.jsonWriter = new SequentialJsonWriter(
      this.effortPath,
      () => ({ effort: this.cached || this.getDefaultEffort() }),
      this.config.getEncryptionKey()
    );
    this.ensureDataDir();
  }

  get(): EffortValue {
    return this.getStored() || this.getDefaultEffort();
  }

  set(effort: string): EffortValue {
    const value = normalizeEffort(effort) || this.getDefaultEffort();
    this.cached = value;
    this.jsonWriter.schedule();
    return value;
  }

  flush(): Promise<void> {
    return this.jsonWriter.flush();
  }

  onModuleDestroy(): Promise<void> {
    return this.flush();
  }

  private getStored(): EffortValue | '' {
    if (this.cached !== null) return this.cached;
    if (!existsSync(this.effortPath)) {
      this.cached = '';
      return '';
    }
    try {
      const raw = readFileSync(this.effortPath, 'utf8');
      const decrypted = decryptData(raw, this.config.getEncryptionKey());
      const data = JSON.parse(decrypted);
      this.cached = normalizeEffort((data as { effort?: string }).effort);
      return this.cached;
    } catch (err) {
      console.error('Failed to parse effort load:', err);
      this.cached = '';
      return '';
    }
  }

  private getDefaultEffort(): EffortValue {
    return resolveEffort(
      typeof this.config.getDefaultEffort === 'function'
        ? this.config.getDefaultEffort()
        : process.env.CLAUDE_EFFORT,
      DEFAULT_EFFORT
    );
  }

  private ensureDataDir(): void {
    const dataDir = this.config.getConversationDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }
}
