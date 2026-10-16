import { basename, join } from 'node:path';
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
  shareLocalMcpEnvironment();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** MCP clients may inherit only a small allowlist rather than process.env. */
function shareLocalMcpEnvironment(): void {
  const raw = process.env.MCP_CONFIG_JSON;
  if (!raw) return;
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isRecord(manifest)) return;
  const servers = isRecord(manifest.mcpServers)
    ? manifest.mcpServers
    : manifest;
  let changed = false;
  for (const entry of Object.values(servers)) {
    if (
      !isRecord(entry) ||
      typeof entry.command !== 'string' ||
      !['fibe', 'fibe.exe'].includes(basename(entry.command))
    )
      continue;
    const args = entry.args;
    if (
      !Array.isArray(args) ||
      !args.some((arg, i) => arg === 'mcp' && args[i + 1] === 'serve')
    )
      continue;
    if (entry.env !== undefined && !isRecord(entry.env)) continue;
    const env = { ...(entry.env ?? {}) };
    for (const key of [
      'PLAYGROUNDS_DIR',
      'HOST_ROOT',
      'HOST_ROOT_DOMAIN',
      'HOST_URL_SCHEME',
    ]) {
      const value = process.env[key];
      const explicit = env[key];
      if (value?.trim() && !(typeof explicit === 'string' && explicit.trim())) {
        env[key] = value;
        changed = true;
      }
    }
    entry.env = env;
  }
  if (changed) process.env.MCP_CONFIG_JSON = JSON.stringify(manifest);
}
