import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';

@Injectable()
export class ModelStoreService {
  private readonly modelPath: string;
  private cached: string | null = null;

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getConversationDataDir();
    this.modelPath = join(dataDir, 'model.json');
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
      const data = JSON.parse(readFileSync(this.modelPath, 'utf8'));
      this.cached = (data as { model?: string }).model ?? '';
      return this.cached;
    } catch {
      this.cached = '';
      return '';
    }
  }

  set(model: string): string {
    const value = (model ?? '').trim();
    this.cached = value;
    void writeFile(
      this.modelPath,
      JSON.stringify({ model: value }, null, 2)
    );
    return value;
  }

  private ensureDataDir(): void {
    const dataDir = this.config.getConversationDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }
}
