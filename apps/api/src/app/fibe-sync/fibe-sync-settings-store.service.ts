import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    this.settings = {
      ...this.settings,
      ...this.sanitizePatch(patch),
    };
    this.persist();
    return this.get();
  }

  isEnabled(type: 'messages' | 'activity' | 'raw_providers'): boolean {
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
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as FibeSyncSettingsPatch;
      return { ...this.defaults(), ...this.sanitizePatch(parsed) };
    } catch {
      return this.defaults();
    }
  }

  private sanitizePatch(patch: FibeSyncSettingsPatch): FibeSyncSettingsPatch {
    const clean: FibeSyncSettingsPatch = {};
    if (typeof patch.messages === 'boolean') clean.messages = patch.messages;
    if (typeof patch.activity === 'boolean') clean.activity = patch.activity;
    if (typeof patch.rawProviders === 'boolean') clean.rawProviders = patch.rawProviders;
    if (typeof patch.rawProviderCapture === 'boolean') clean.rawProviderCapture = patch.rawProviderCapture;
    return clean;
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf8');
  }
}
