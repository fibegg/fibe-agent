import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ConfigService } from '../config/config.service';

const execFileAsync = promisify(execFile);
const BASE_ARGS = ['--output', 'json', 'local', 'playgrounds'] as const;
const LOCAL_PLAYGROUNDS_DIR_MISSING = 'LOCAL_PLAYGROUNDS_DIR_MISSING';

export async function runLocalPlaygroundsCli(
  config: ConfigService,
  args: string[],
): Promise<string> {
  const targetBase = resolve(config.getMarqueeRoot(), 'playgrounds');
  const rootDomain = config.getMarqueeRootDomain?.();
  const env = {
    ...process.env,
    MARQUEE_ROOT: targetBase,
    ...(rootDomain ? { MARQUEE_ROOT_DOMAIN: rootDomain } : {}),
  };
  const { stdout } = await execFileAsync('fibe', [...BASE_ARGS, ...args], {
    env,
  });
  return String(stdout);
}

export function isLocalPlaygroundsUnavailableError(err: unknown): boolean {
  return nodeErrorCode(err) === 'ENOENT' || cliErrorCode(err) === LOCAL_PLAYGROUNDS_DIR_MISSING;
}

function nodeErrorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : undefined;
}

function cliErrorCode(err: unknown): string | undefined {
  const stderr = typeof err === 'object' && err !== null && 'stderr' in err ? (err as { stderr?: unknown }).stderr : undefined;
  if (typeof stderr !== 'string' || stderr.trim() === '') return undefined;
  try {
    const payload = JSON.parse(stderr) as { error?: { code?: unknown } };
    return typeof payload.error?.code === 'string' ? payload.error.code : undefined;
  } catch {
    return undefined;
  }
}
