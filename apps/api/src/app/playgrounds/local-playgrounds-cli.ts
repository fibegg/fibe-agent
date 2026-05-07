import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ConfigService } from '../config/config.service';

const execFileAsync = promisify(execFile);
const BASE_ARGS = ['--output', 'json', 'local', 'playgrounds'] as const;

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
