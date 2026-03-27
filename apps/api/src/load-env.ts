import { join } from 'node:path';

/**
 * Load .env file in non-production environments.
 * In production, env vars are injected directly (Docker / Compose).
 * dotenv is available as a transitive dep; the try/catch is a safety net.
 */
export function loadDevEnv(): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    // dotenv is a transitive dependency; require() is fine in CJS bundles
    const { config } = require('dotenv') as { config: (opts: { path: string }) => void };

    config({ path: join(process.cwd(), '.env') });
  } catch {
    // dotenv not available — continue without it
  }
}
