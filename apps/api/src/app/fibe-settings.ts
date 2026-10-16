import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger, NotFoundException } from '@nestjs/common';

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

export async function loadFibeSettings(
  dir: string,
  read: (path: string) => Promise<string> = (path) => readFile(path, 'utf-8'),
): Promise<ResolvedFibeSettings> {
  let settings: FibeSettings = {};

  try {
    const settingsPath = join(dir, '.fibe', 'settings.json');
    const content = await read(settingsPath);
    settings = JSON.parse(content) as FibeSettings;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (
      !(err instanceof NotFoundException) &&
      code !== 'ENOENT' &&
      code !== 'ENOTDIR'
    ) {
      logger.warn(
        `Failed to parse .fibe/settings.json in ${dir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const browserSettings = settings.fileBrowser || {};

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
