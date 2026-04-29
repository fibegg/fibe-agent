import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';

const logger = new Logger('FibeSettings');

export interface FibeSettings {
  fileBrowser?: {
    exclude?: string[];
    showHidden?: boolean;
    visibleHidden?: string[];
  };
}

export interface ResolvedFibeSettings {
  ignoredNames: Set<string>;
  visibleHidden: Set<string>;
  showHidden: boolean;
}

const DEFAULT_IGNORED_NAMES = ['node_modules', '.git'];
const DEFAULT_VISIBLE_HIDDEN = ['.claude', '.opencode'];

export async function loadFibeSettings(dir: string): Promise<ResolvedFibeSettings> {
  let settings: FibeSettings = {};

  try {
    const settingsPath = join(dir, '.fibe', 'settings.json');
    const content = await readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content) as FibeSettings;
  } catch (err: unknown) {
    // It's normal for the file to not exist
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`Failed to parse .fibe/settings.json in ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const browserSettings = settings.fileBrowser || {};

  // Combine defaults with user settings
  const ignoredNamesArray = [
    ...DEFAULT_IGNORED_NAMES,
    ...(browserSettings.exclude || []),
  ];

  const visibleHiddenArray = [
    ...DEFAULT_VISIBLE_HIDDEN,
    ...(browserSettings.visibleHidden || []),
  ];

  return {
    ignoredNames: new Set(ignoredNamesArray),
    visibleHidden: new Set(visibleHiddenArray),
    showHidden: browserSettings.showHidden ?? false,
  };
}
