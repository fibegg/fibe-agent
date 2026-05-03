import { existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';

/** Real HOME and NVM_DIR captured at module load time, before any test overrides. */
const ORIG_HOME = process.env.HOME?.trim() ?? '';
const ORIG_NVM_DIR = process.env.NVM_DIR?.trim() || (ORIG_HOME ? join(ORIG_HOME, '.nvm') : '');

let _cachedPath: string | null | undefined = undefined;

/**
 * Returns nvm bin directories sorted newest-version-first.
 * Each entry is e.g. `~/.nvm/versions/node/v24.14.1/bin`.
 */
function nvmBinDirs(): string[] {
  if (!ORIG_NVM_DIR) return [];
  const versionsDir = join(ORIG_NVM_DIR, 'versions', 'node');
  try {
    if (!existsSync(versionsDir)) return [];
    return readdirSync(versionsDir)
      .filter((v) => v.startsWith('v'))
      .sort((a, b) => {
        const parse = (s: string) => (s.match(/^v(\d+)\.(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
        const [aMaj = 0, aMin = 0, aPat = 0] = parse(a);
        const [bMaj = 0, bMin = 0, bPat = 0] = parse(b);
        return bMaj - aMaj || bMin - aMin || bPat - aPat;
      })
      .map((v) => join(versionsDir, v, 'bin'));
  } catch {
    return [];
  }
}

/**
 * Resolves the absolute path to the `claude` CLI binary.
 *
 * Resolution order:
 *  1. `CLAUDE_PATH` env var — explicit override, highest priority
 *  2. `command -v claude` — shell lookup on the current PATH
 *  3. nvm bin directories — newest Node version first
 *  4. Common system locations (`~/.npm/bin`, `/usr/local/bin`, Homebrew)
 *  5. Bare `'claude'` fallback — lets spawn produce a clear ENOENT
 *
 * Result is cached for the process lifetime.
 * Call `_resetResolveClaudeCache()` in tests that change `CLAUDE_PATH`.
 */
export function resolveClaude(): string {
  if (_cachedPath !== undefined) return _cachedPath ?? 'claude';

  // 1. Explicit override
  const override = process.env['CLAUDE_PATH']?.trim();
  if (override && existsSync(override)) {
    return (_cachedPath = override);
  }

  // 2. Shell lookup (respects the running process PATH)
  try {
    const found = execSync('command -v claude', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (found && existsSync(found)) return (_cachedPath = found);
  } catch {
    /* not on PATH — fall through */
  }

  // 3 & 4. Probe nvm dirs then common system locations
  const staticCandidates = [
    ...(ORIG_HOME ? [join(ORIG_HOME, '.npm', 'bin', 'claude')] : []),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    '/opt/homebrew/bin/claude',
  ];
  for (const candidate of [
    ...nvmBinDirs().map((d) => join(d, 'claude')),
    ...staticCandidates,
  ]) {
    if (existsSync(candidate)) return (_cachedPath = candidate);
  }

  // 5. Fallback
  _cachedPath = null;
  return 'claude';
}

/**
 * Returns an enriched PATH that prepends:
 *  - The parent directory of `CLAUDE_PATH` override (if set)
 *  - All nvm bin directories (newest first)
 *
 * This ensures `node` and `claude` are resolvable in restricted shells
 * (e.g. NestJS spawn without loading `.zshrc` / nvm init).
 * Already-present segments are not duplicated.
 */
export function getEnrichedPath(currentPath: string): string {
  const existing = new Set(currentPath.split(':').filter(Boolean));
  const extra: string[] = [];

  const override = process.env['CLAUDE_PATH']?.trim();
  if (override) {
    const dir = dirname(override);
    if (!existing.has(dir)) extra.push(dir);
  }

  for (const dir of nvmBinDirs()) {
    if (!existing.has(dir)) extra.push(dir);
  }

  return extra.length ? [...extra, currentPath].join(':') : currentPath;
}

/** Reset the cached path. Required in tests that mutate `CLAUDE_PATH`. */
export function _resetResolveClaudeCache(): void {
  _cachedPath = undefined;
}
