import { join } from 'node:path';
import { applyFibeSettings } from './app/config/fibe-settings';

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

/** Applies fibe.yml settings after .env overrides are loaded. */
export { applyFibeSettings as loadFibeEnv };
