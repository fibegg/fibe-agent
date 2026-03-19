import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { containerLog } from './container-logger';

const POST_INIT_CONTEXT = 'PostInit';
const STATE_FILENAME = 'post-init-state.json';
const RUN_TIMEOUT_MS = 600_000;
const RUN_TIMEOUT_S = RUN_TIMEOUT_MS / 1000;

export interface PostInitStateFile {
  state: 'running' | 'done' | 'failed';
  output?: string;
  error?: string;
  finishedAt?: string;
}

export function readPostInitState(dataDir: string): PostInitStateFile | null {
  const statePath = join(dataDir, STATE_FILENAME);
  if (!existsSync(statePath)) return null;
  try {
    const raw = readFileSync(statePath, 'utf-8');
    return JSON.parse(raw) as PostInitStateFile;
  } catch {
    return null;
  }
}

export function writePostInitState(
  dataDir: string,
  payload: PostInitStateFile
): void {
  const statePath = join(dataDir, STATE_FILENAME);
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(statePath, JSON.stringify(payload, null, 0), 'utf-8');
}

export function runPostInitOnce(
  dataDir: string,
  script: string,
  cwd: string
): Promise<void> {
  const existing = readPostInitState(dataDir);
  if (existing && (existing.state === 'done' || existing.state === 'failed')) {
    return Promise.resolve();
  }

  writePostInitState(dataDir, { state: 'running' });

  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', script], {
      env: process.env,
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      containerLog.warn(
        `Post-init script timed out after ${RUN_TIMEOUT_S}s`,
        POST_INIT_CONTEXT
      );
      const output = [stdout, stderr].filter(Boolean).join('\n') || undefined;
      writePostInitState(dataDir, {
        state: 'failed',
        output,
        error: `Script timed out after ${RUN_TIMEOUT_S} seconds`,
        finishedAt: new Date().toISOString(),
      });
      resolve();
    }, RUN_TIMEOUT_MS);

    proc.on('close', (code, signal) => {
      clearTimeout(timeout);
      const output = [stdout, stderr].filter(Boolean).join('\n') || undefined;
      const failed = code !== 0 && code != null;
      if (failed) {
        containerLog.warn(
          `Post-init script exited code=${code} signal=${signal ?? 'none'}`,
          POST_INIT_CONTEXT
        );
      } else {
        containerLog.log('Post-init script completed successfully', POST_INIT_CONTEXT);
      }
      writePostInitState(dataDir, {
        state: failed ? 'failed' : 'done',
        output,
        error: failed ? `Exit code ${code}${signal ? `, signal ${signal}` : ''}` : undefined,
        finishedAt: new Date().toISOString(),
      });
      resolve();
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : String(err);
      containerLog.error(`Post-init script spawn error: ${message}`, POST_INIT_CONTEXT);
      writePostInitState(dataDir, {
        state: 'failed',
        error: message,
        finishedAt: new Date().toISOString(),
      });
      resolve();
    });
  });
}
