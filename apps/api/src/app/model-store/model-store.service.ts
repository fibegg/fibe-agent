import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';

@Injectable()
export class ModelStoreService {
  private readonly modelPath: string;

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getDataDir();
    this.modelPath = join(dataDir, 'model.json');
    this.ensureDataDir();
  }

  get(): string {
    if (!existsSync(this.modelPath)) return '';
    try {
      const data = JSON.parse(readFileSync(this.modelPath, 'utf8'));
      return (data as { model?: string }).model ?? '';
    } catch {
      return '';
    }
  }

  set(model: string): string {
    const value = (model ?? '').trim();
    writeFileSync(
      this.modelPath,
      JSON.stringify({ model: value }, null, 2)
    );
    return value;
  }

  private ensureDataDir(): void {
    const dataDir = this.config.getDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }
}
