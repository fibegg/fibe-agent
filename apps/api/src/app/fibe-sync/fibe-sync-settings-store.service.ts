import { Injectable } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';

export interface FibeSyncSettings {
  messages: boolean;
  activity: boolean;
  rawProviders: boolean;
  rawProviderCapture: boolean;
}

type FibeSyncSettingsPatch = Partial<FibeSyncSettings>;

@Injectable()
export class FibeSyncSettingsStoreService {
  private readonly filePath: string;
  private settings: FibeSyncSettings;

  constructor(private readonly config: ConfigService) {
    const dataDir = this.config.getConversationDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = join(dataDir, 'fibe-sync-settings.json');
    this.settings = this.load();
  }

  get(): FibeSyncSettings {
    return { ...this.settings };
  }

  update(patch: FibeSyncSettingsPatch): FibeSyncSettings {
    const next = {
      ...this.settings,
      ...this.sanitizePatch(patch),
    };
    this.persist(next);
    this.settings = next;
    return this.get();
  }

  isEnabled(type: 'messages' | 'activity' | 'provider_traffic'): boolean {
    if (type === 'messages') return this.settings.messages;
    if (type === 'activity') return this.settings.activity;
    return this.settings.rawProviders;
  }

  private defaults(): FibeSyncSettings {
    const syncEnabled = this.config.isFibeSyncEnabled();
    return {
      messages: syncEnabled,
      activity: syncEnabled,
      rawProviders: syncEnabled,
      rawProviderCapture: process.env['PROVIDER_TRAFFIC_CAPTURE'] === 'true',
    };
  }

  private load(): FibeSyncSettings {
    if (!existsSync(this.filePath)) return this.defaults();
    try {
      const parsed = JSON.parse(
        readFileSync(this.filePath, 'utf8'),
      ) as FibeSyncSettingsPatch;
      return { ...this.defaults(), ...this.sanitizePatch(parsed) };
    } catch {
      return this.defaults();
    }
  }

  private sanitizePatch(patch: FibeSyncSettingsPatch): FibeSyncSettingsPatch {
    const clean: FibeSyncSettingsPatch = {};
    if (typeof patch.messages === 'boolean') clean.messages = patch.messages;
    if (typeof patch.activity === 'boolean') clean.activity = patch.activity;
    if (typeof patch.rawProviders === 'boolean')
      clean.rawProviders = patch.rawProviders;
    if (typeof patch.rawProviderCapture === 'boolean')
      clean.rawProviderCapture = patch.rawProviderCapture;
    return clean;
  }

  private persist(settings: FibeSyncSettings): void {
    // Publish only a complete new state; this is not a copy of the old file.
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(settings, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      renameSync(temporary, this.filePath);
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new AggregateError(
            [error, cleanupError],
            'Settings write and temporary state cleanup failed',
          );
        }
      }
      throw error;
    }
  }
}
