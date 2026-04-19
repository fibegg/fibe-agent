import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ConfigService } from '../config/config.service';

const execFileAsync = promisify(execFile);
const BASE_ARGS = ['--output', 'table', 'local-playgrounds'] as const;

export async function runLocalPlaygroundsCli(
  config: ConfigService,
  args: string[],
): Promise<string> {
  const targetBase = resolve(config.getPlayroomsRoot(), 'playgrounds');
  const { stdout } = await execFileAsync('fibe', [...BASE_ARGS, ...args], {
    env: { ...process.env, PLAYROOMS_ROOT: targetBase },
  });
  return String(stdout);
}
