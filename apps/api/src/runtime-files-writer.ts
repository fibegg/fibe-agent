import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { containerLog } from './container-logger';

const CONTEXT = 'RuntimeFiles';
const ENV_KEY = 'AGENT_RUNTIME_FILES_JSON';

type RuntimeFileFormat = 'json' | 'text';
type RuntimeFileOperation = 'deep_merge' | 'write_if_missing' | 'overwrite';

interface RuntimeFileEntry {
  path?: string;
  format?: RuntimeFileFormat;
  operation?: RuntimeFileOperation;
  mode?: string | number;
  content?: unknown;
}

interface RuntimeFilesPayload {
  version?: number;
  files?: RuntimeFileEntry[];
}

function getDataDir(): string {
  return process.env.DATA_DIR ?? join(process.cwd(), 'data');
}

function safeRoots(): string[] {
  return [process.env.HOME, getDataDir(), process.cwd()]
    .filter((root): root is string => !!root?.trim())
    .map((root) => resolve(root));
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel));
}

function resolveSafePath(rawPath: string | undefined): string | null {
  if (!rawPath?.trim() || rawPath.includes('\0') || !isAbsolute(rawPath)) {
    return null;
  }

  const resolved = resolve(rawPath);
  return safeRoots().some((root) => isInside(resolved, root)) ? resolved : null;
}

function parseMode(raw: string | number | undefined, fallback: number): number {
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = parseInt(raw, 8);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = result[key];
    result[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : value;
  }
  return result;
}

function existingJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function writeJson(path: string, entry: RuntimeFileEntry): boolean {
  if (!isPlainObject(entry.content)) {
    containerLog.warn(`Skipping JSON runtime file with non-object content: ${path}`, CONTEXT);
    return false;
  }

  const mode = parseMode(entry.mode, 0o600);
  ensureParent(path);
  const content =
    entry.operation === 'overwrite'
      ? entry.content
      : deepMerge(existingJson(path), entry.content);
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`, { mode });
  chmodSync(path, mode);
  return true;
}

function writeText(path: string, entry: RuntimeFileEntry): boolean {
  if (typeof entry.content !== 'string') {
    containerLog.warn(`Skipping text runtime file with non-string content: ${path}`, CONTEXT);
    return false;
  }

  if (entry.operation === 'write_if_missing' && existsSync(path)) {
    return false;
  }

  const mode = parseMode(entry.mode, 0o644);
  ensureParent(path);
  writeFileSync(path, entry.content, { mode });
  chmodSync(path, mode);
  return true;
}

function parsePayload(raw: string): RuntimeFilesPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || !Array.isArray(parsed.files)) return null;
    return parsed as RuntimeFilesPayload;
  } catch {
    return null;
  }
}

export function writeRuntimeFiles(): number {
  const raw = process.env[ENV_KEY];
  if (!raw?.trim()) return 0;

  const payload = parsePayload(raw);
  if (!payload) {
    containerLog.warn(`${ENV_KEY} could not be parsed`, CONTEXT);
    return 0;
  }

  let written = 0;
  for (const entry of payload.files ?? []) {
    const path = resolveSafePath(entry.path);
    if (!path) {
      containerLog.warn(`Skipping unsafe runtime file path: ${entry.path ?? '(blank)'}`, CONTEXT);
      continue;
    }

    try {
      const format = entry.format ?? 'text';
      const changed = format === 'json' ? writeJson(path, entry) : writeText(path, entry);
      if (changed) written++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      containerLog.error(`Failed to write runtime file ${path}: ${message}`, CONTEXT);
    }
  }

  return written;
}
