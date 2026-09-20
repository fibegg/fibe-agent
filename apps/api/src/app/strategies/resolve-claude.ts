import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';

/** Real HOME and NVM_DIR captured at module load time, before any test overrides. */
const ORIG_HOME = process.env.HOME?.trim() ?? '';
const ORIG_NVM_DIR =
  process.env.NVM_DIR?.trim() || (ORIG_HOME ? join(ORIG_HOME, '.nvm') : '');

let _cachedPath: string | null | undefined = undefined;

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Returns nvm bin directories newest first. */
function nvmBinDirs(): string[] {
  if (!ORIG_NVM_DIR) return [];
  const versionsDir = join(ORIG_NVM_DIR, 'versions', 'node');
  try {
    if (!existsSync(versionsDir)) return [];
    return readdirSync(versionsDir)
      .filter((v) => v.startsWith('v'))
      .sort((a, b) => {
        const parse = (s: string) =>
          (s.match(/^v(\d+)\.(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
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
 * Resolves and caches Claude from a fail-closed override, PATH, newest nvm,
 * common install paths, then the bare command for a clear spawn error.
 */
export function resolveClaude(): string {
  if (_cachedPath !== undefined) return _cachedPath ?? 'claude';

  const override = process.env['CLAUDE_PATH']?.trim();
  if (override && isExecutable(override)) {
    return (_cachedPath = override);
  }
  if (override) {
    throw new Error(
      existsSync(override)
        ? `CLAUDE_PATH is set but is not executable: ${override}`
        : `CLAUDE_PATH is set but does not exist: ${override}`,
    );
  }

  try {
    const found = execSync('command -v claude', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (found && isExecutable(found)) return (_cachedPath = found);
  } catch {
    // Probe the fallback paths below.
  }

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
    if (isExecutable(candidate)) return (_cachedPath = candidate);
  }

  _cachedPath = null;
  return 'claude';
}

/** Prepends the override and nvm directories needed by restricted shells. */
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
