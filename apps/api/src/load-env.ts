import { join } from 'node:path';
import { applyFibeSettings } from './app/config/fibe-settings';
import { ConfigService } from './app/config/config.service';

/** Loads .env outside production. */
export function loadDevEnv(): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const { config } = require('dotenv') as {
      config: (opts: { path: string }) => void;
    };
    config({ path: join(process.cwd(), '.env') });
  } catch {
    // dotenv is optional outside local development.
  }
}

/** Applies settings and shares the UI's absolute link path with child tools. */
export function loadFibeEnv(): void {
  applyFibeSettings();
  process.env.PLAYGROUNDS_DIR = new ConfigService().getPlaygroundsDir();
}
