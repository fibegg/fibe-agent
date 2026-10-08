import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { containerLog } from './container-logger';

const STATE_FILENAME = 'post-init-state.json';
const LOCK_DIRECTORY = '.post-init-execution.lock';
const INSTANCE_ID = randomUUID();
const OUTPUT_LIMIT = 65_536;

export interface PostInitStateFile {
  state: 'pending' | 'running' | 'succeeded' | 'failed';
  runId?: string;
  scriptDigest?: string;
  output?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  noSetupRequired?: boolean;
}
export interface PostInitOptions {
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  killGraceMs?: number;
}
interface Claim { runId: string; pid: number; instanceId: string; processStart: string | null }
export class PostInitConflict extends Error {
  constructor() { super('Setup execution is already active or retry is not allowed'); }
}

function processStart(pid: number): string | null {
  try { return readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[19]; }
  catch { return null; }
}
function claimPath(dataDir: string): string { return join(dataDir, LOCK_DIRECTORY, 'claim.json'); }
function readClaim(dataDir: string): Claim | null {
  try { return JSON.parse(readFileSync(claimPath(dataDir), 'utf8')); }
  catch { return null; }
}
function claimAlive(claim: Claim): boolean {
  try { process.kill(claim.pid, 0); }
  catch { return false; }
  const start = processStart(claim.pid);
  if (claim.processStart && start) return claim.processStart === start;
  return claim.pid !== process.pid || claim.instanceId === INSTANCE_ID;
}
function release(dataDir: string, runId: string): void {
  if (readClaim(dataDir)?.runId === runId) rmSync(join(dataDir, LOCK_DIRECTORY), { recursive: true, force: true });
}

export function readPostInitState(dataDir: string): PostInitStateFile | null {
  const path = join(dataDir, STATE_FILENAME);
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (value.state === 'done') value.state = 'succeeded';
    if (!['pending', 'running', 'succeeded', 'failed'].includes(value.state)) throw new Error();
    return value;
  } catch {
    return { state: 'failed', error: 'Persisted setup status is unreadable; explicit retry is required' };
  }
}
export function writePostInitState(dataDir: string, payload: PostInitStateFile): void {
  mkdirSync(dataDir, { recursive: true });
  const temporary = join(dataDir, `${STATE_FILENAME}.${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, join(dataDir, STATE_FILENAME));
}

export function recoverPostInitOnBoot(dataDir: string): PostInitStateFile | null {
  const state = readPostInitState(dataDir);
  const claim = readClaim(dataDir);
  if (claim && claimAlive(claim)) return state;
  if (claim || existsSync(join(dataDir, LOCK_DIRECTORY))) rmSync(join(dataDir, LOCK_DIRECTORY), { recursive: true, force: true });
  if (state?.state === 'running' || state?.state === 'pending') {
    const failed: PostInitStateFile = { ...state, state: 'failed', error: 'Setup was interrupted by a runtime restart; explicit retry is required', finishedAt: new Date().toISOString() };
    writePostInitState(dataDir, failed);
    return failed;
  }
  return state;
}

function redact(value: string, secrets: string[]): string {
  let result = value;
  for (const secret of secrets) result = result.split(secret).join('[REDACTED]');
  return result;
}
class OutputCapture {
  private decoder = new StringDecoder('utf8');
  private pending = '';
  private value = '';
  constructor(private secrets: string[], private hold: number) {}
  append(chunk: Buffer): void {
    this.pending += this.decoder.write(chunk);
    if (this.pending.length <= this.hold) return;
    // Redact the entire overlap before selecting a bounded prefix. A secret
    // crossing either a chunk or the output limit cannot leave its prefix.
    const cut = this.pending.length - this.hold;
    let safeCut = cut;
    for (const secret of this.secrets) {
      let start = this.pending.indexOf(secret, Math.max(0, cut - secret.length));
      while (start >= 0 && start < cut) {
        if (start + secret.length > cut) safeCut = Math.min(safeCut, start);
        start = this.pending.indexOf(secret, start + 1);
      }
    }
    this.value = (this.value + redact(this.pending.slice(0, safeCut), this.secrets)).slice(0, OUTPUT_LIMIT);
    this.pending = this.pending.slice(safeCut);
  }
  finish(): string {
    return (this.value + redact(this.pending + this.decoder.end(), this.secrets)).slice(0, OUTPUT_LIMIT);
  }
}

function run(dataDir: string, script: string | undefined, cwd: string, options: PostInitOptions, retry: boolean): Promise<void> {
  mkdirSync(dataDir, { recursive: true });
  try { mkdirSync(join(dataDir, LOCK_DIRECTORY)); }
  catch { if (retry) throw new PostInitConflict(); return Promise.resolve(); }
  const runId = randomUUID();
  const claim: Claim = { runId, pid: process.pid, instanceId: INSTANCE_ID, processStart: processStart(process.pid) };
  writeFileSync(claimPath(dataDir), JSON.stringify(claim), { mode: 0o600 });
  const existing = readPostInitState(dataDir);
  if ((retry && existing?.state !== 'failed') || (!retry && existing)) {
    release(dataDir, runId);
    if (retry) throw new PostInitConflict();
    return Promise.resolve();
  }
  const source = script ?? '';
  const scriptDigest = createHash('sha256').update(source).digest('hex');
  const startedAt = new Date().toISOString();
  const environment = { ...process.env, ...options.env };
  const secrets = Object.entries(environment).filter(([key, value]) => value && (key.startsWith('FIBE_PRESET_INPUT_') || /TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|AUTH/i.test(key))).map(([, value]) => String(value)).sort((a, b) => b.length - a.length);
  writePostInitState(dataDir, { state: 'running', runId, scriptDigest, startedAt });
  if (!source) {
    writePostInitState(dataDir, { state: 'succeeded', runId, scriptDigest, startedAt, finishedAt: new Date().toISOString(), noSetupRequired: true });
    release(dataDir, runId);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let terminal = false;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let proc: ReturnType<typeof spawn> | undefined;
    const hold = Math.max(1, ...secrets.map((secret) => secret.length));
    const stdout = new OutputCapture(secrets, hold);
    const stderr = new OutputCapture(secrets, hold);
    const finish = (state: 'succeeded' | 'failed', error?: string): void => {
      if (terminal) return;
      terminal = true;
      if (timeout) clearTimeout(timeout);
      const current = readPostInitState(dataDir);
      if (current?.runId === runId && current.state === 'running') {
        const output = redact([stdout.finish(), stderr.finish()].filter(Boolean).join('\n'), secrets).slice(0, OUTPUT_LIMIT);
        writePostInitState(dataDir, { state, runId, scriptDigest, startedAt, finishedAt: new Date().toISOString(), output: output || undefined, error: error ? redact(error, secrets).slice(0, 1024) : undefined });
      }
      if (!timedOut) { release(dataDir, runId); resolve(); }
    };
    const killGroup = (signal: NodeJS.Signals): void => {
      if (!proc?.pid) return;
      try { if (process.platform === 'win32') proc.kill(signal); else process.kill(-proc.pid, signal); }
      catch { /* The process group may already have exited. */ }
    };
    try {
      proc = spawn('sh', ['-c', source], { env: environment, cwd, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      proc.stdout?.on('data', (chunk: Buffer) => stdout.append(chunk));
      proc.stderr?.on('data', (chunk: Buffer) => stderr.append(chunk));
      proc.on('error', () => finish('failed', 'Setup process could not be started'));
      proc.on('close', (code, signal) => {
        const failed = code === null || code !== 0 || Boolean(signal);
        finish(failed ? 'failed' : 'succeeded', failed ? `Exit code ${code}${signal ? `, signal ${signal}` : ''}` : undefined);
      });
      timeout = setTimeout(() => {
        if (terminal) return;
        timedOut = true;
        finish('failed', `Script timed out after ${(options.timeoutMs ?? 600_000) / 1000} seconds`);
        killGroup('SIGTERM');
        containerLog.warn('Post-init setup failed: execution deadline exceeded', 'PostInit');
        setTimeout(() => { killGroup('SIGKILL'); release(dataDir, runId); resolve(); }, options.killGraceMs ?? 500);
      }, options.timeoutMs ?? 600_000);
    } catch { finish('failed', 'Setup process could not be started'); }
  });
}
export function runPostInitOnce(dataDir: string, script: string | undefined, cwd: string, options: PostInitOptions = {}): Promise<void> {
  return run(dataDir, script, cwd, options, false);
}
export function retryPostInitFailed(dataDir: string, script: string | undefined, cwd: string, options: PostInitOptions = {}): Promise<void> {
  return run(dataDir, script, cwd, options, true);
}
