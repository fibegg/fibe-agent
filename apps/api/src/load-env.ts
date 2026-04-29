import { join } from 'node:path';
import { applyFibeSettings } from './app/config/fibe-settings';

/**
 * Load .env file in non-production environments.
 * In production env vars are injected by Docker / Compose.
 */
export function loadDevEnv(): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const { config } = require('dotenv') as { config: (opts: { path: string }) => void };
    config({ path: join(process.cwd(), '.env') });
  } catch {
    // dotenv not available — continue without it
  }
}

/**
 * Apply unified fibe settings from FIBE_SETTINGS_JSON and /app/fibe.yml.
 * Call after loadDevEnv() so .env values (which win) are already in process.env.
 */
export { applyFibeSettings as loadFibeEnv };
