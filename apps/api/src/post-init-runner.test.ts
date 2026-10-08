import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  readPostInitState,
  writePostInitState,
  runPostInitOnce,
  retryPostInitFailed,
  recoverPostInitOnBoot,
  PostInitConflict,
} from './post-init-runner';

describe('post-init-runner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'post-init-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('readPostInitState returns null when file does not exist', () => {
    expect(readPostInitState(tmpDir)).toBeNull();
  });

  test('readPostInitState fails closed when file is invalid JSON', () => {
    writeFileSync(join(tmpDir, 'post-init-state.json'), 'not json', 'utf-8');
    expect(readPostInitState(tmpDir)?.state).toBe('failed');
  });

  test('readPostInitState returns parsed state when file exists', () => {
    writePostInitState(tmpDir, {
      state: 'succeeded',
      output: 'ok',
      finishedAt: '2026-03-18T12:00:00.000Z',
    });
    expect(readPostInitState(tmpDir)).toEqual({
      state: 'succeeded',
      output: 'ok',
      finishedAt: '2026-03-18T12:00:00.000Z',
    });
  });

  test('writePostInitState creates file and readPostInitState reads it', () => {
    writePostInitState(tmpDir, { state: 'running' });
    expect(readPostInitState(tmpDir)).toEqual({ state: 'running' });
  });

  test('runPostInitOnce runs script and writes done state', async () => {
    await runPostInitOnce(tmpDir, 'echo hello', tmpDir);
    const state = readPostInitState(tmpDir);
    expect(state?.state).toBe('succeeded');
    expect(state?.output).toContain('hello');
    expect(state?.finishedAt).toBeDefined();
  });

  test('runPostInitOnce skips run when state already done', async () => {
    writePostInitState(tmpDir, {
      state: 'succeeded',
      finishedAt: '2026-01-01T00:00:00.000Z',
    });
    await runPostInitOnce(tmpDir, 'echo should-not-run', tmpDir);
    const state = readPostInitState(tmpDir);
    expect(state?.state).toBe('succeeded');
    expect(state?.finishedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(
      state?.output == null || !String(state.output).includes('should-not-run'),
    ).toBe(true);
  });

  test('runPostInitOnce skips run when state already failed', async () => {
    writePostInitState(tmpDir, {
      state: 'failed',
      error: 'previous',
      finishedAt: '2026-01-01T00:00:00.000Z',
    });
    await runPostInitOnce(tmpDir, 'echo should-not-run', tmpDir);
    const state = readPostInitState(tmpDir);
    expect(state?.state).toBe('failed');
    expect(state?.error).toBe('previous');
    expect(
      state?.output == null || !String(state.output).includes('should-not-run'),
    ).toBe(true);
  });

  test('runPostInitOnce records failed state for non-zero exit code', async () => {
    await runPostInitOnce(tmpDir, 'exit 1', tmpDir);
    const state = readPostInitState(tmpDir);
    expect(state?.state).toBe('failed');
    expect(state?.error).toContain('Exit code 1');
    expect(state?.finishedAt).toBeDefined();
  });

  test('runPostInitOnce captures stderr in output', async () => {
    await runPostInitOnce(tmpDir, 'echo stderr-msg >&2', tmpDir);
    const state = readPostInitState(tmpDir);
    expect(state?.state).toBe('succeeded');
    expect(state?.output).toContain('stderr-msg');
  });

  test('runPostInitOnce handles spawn error gracefully', async () => {
    await runPostInitOnce(tmpDir, 'echo test', '/nonexistent-dir-12345');
    const state = readPostInitState(tmpDir);
    expect(state?.state).toBeDefined();
  });

  test('writePostInitState creates dataDir recursively if needed', () => {
    const nested = join(tmpDir, 'a', 'b', 'c');
    writePostInitState(nested, { state: 'running' });
    expect(readPostInitState(nested)).toEqual({ state: 'running' });
  });

  test('runPostInitOnce does not rerun an already running execution', async () => {
    writePostInitState(tmpDir, { state: 'running' });
    await runPostInitOnce(tmpDir, 'echo re-run', tmpDir);
    const state = readPostInitState(tmpDir);
    expect(state?.state).toBe('running');
    expect(state?.output).toBeUndefined();
  });
});


describe('post-init execution claims and terminal outcomes', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'preset-setup-')); });
  afterEach(() => { rmSync(root, {recursive:true, force:true}); });
  test('signal and null exit never report success', async () => {
    await runPostInitOnce(root, 'kill -TERM $$', root);
    expect(readPostInitState(root)?.state).toBe('failed');
    expect(readPostInitState(root)?.error).toContain('signal');
  });
  test('timeout remains terminal after late signal/close callbacks', async () => {
    await runPostInitOnce(root, 'trap "" TERM; sleep 2; echo too-late', root, {timeoutMs:20, killGraceMs:20});
    const state = readPostInitState(root);
    expect(state?.state).toBe('failed');
    expect(state?.error).toContain('timed out');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(readPostInitState(root)).toEqual(state);
  });
  test('two startup claims launch only one child', async () => {
    await Promise.all([runPostInitOnce(root, 'sleep .03; echo first', root), runPostInitOnce(root, 'echo duplicate', root)]);
    expect(readPostInitState(root)?.output).toContain('first');
    expect(readPostInitState(root)?.output).not.toContain('duplicate');
  });
  test('failed-only retry records a new run and rejects a concurrent retry', async () => {
    await runPostInitOnce(root, 'exit 1', root);
    const previous = readPostInitState(root)?.runId;
    const retry = retryPostInitFailed(root, 'sleep .03; echo recovered', root);
    expect(() => retryPostInitFailed(root, 'echo duplicate', root)).toThrow(PostInitConflict);
    await retry;
    expect(readPostInitState(root)?.state).toBe('succeeded');
    expect(readPostInitState(root)?.runId).not.toBe(previous);
    expect(() => retryPostInitFailed(root, 'echo invalid', root)).toThrow(PostInitConflict);
  });
  test('retry runs the current deployed script with captured inputs and its actual digest', async () => {
    await runPostInitOnce(root, 'exit 1', root, {env:{FIBE_PRESET_INPUT_TOKEN:'captured-fixture-token'}});
    const original = readPostInitState(root)?.runId;
    const currentScript = 'printf "%s" "$FIBE_PRESET_INPUT_TOKEN"; exit 4';
    await retryPostInitFailed(root, currentScript, root, {env:{FIBE_PRESET_INPUT_TOKEN:'captured-fixture-token'}});
    const result = readPostInitState(root);
    expect(result?.state).toBe('failed');
    expect(result?.runId).not.toBe(original);
    expect(result?.scriptDigest).toBe(createHash('sha256').update(currentScript).digest('hex'));
    expect(result?.output).toBe('[REDACTED]');
  });
  test('boot marks interrupted running failed and never automatically reruns it', async () => {
    writePostInitState(root, {state:'running', runId:'interrupted', scriptDigest:'fixture-digest'});
    expect(recoverPostInitOnBoot(root)?.state).toBe('failed');
    await runPostInitOnce(root, 'echo forbidden-auto-retry', root);
    expect(readPostInitState(root)?.error).toContain('restart');
    expect(readPostInitState(root)?.output).toBeUndefined();
  });
  test('missing setup succeeds without spawning and retains a real script digest', async () => {
    await runPostInitOnce(root, undefined, root);
    expect(readPostInitState(root)?.state).toBe('succeeded');
    expect(readPostInitState(root)?.noSetupRequired).toBe(true);
    expect(readPostInitState(root)?.scriptDigest).toHaveLength(64);
  });
  test('inputs reach shell only through explicit environment and diagnostics redact multiline values', async () => {
    const value = 'fixture "quoted" secret\nwith newline';
    await runPostInitOnce(root, 'printf "%s" "$FIBE_PRESET_INPUT_VALUE"', root, {env:{FIBE_PRESET_INPUT_VALUE:value}});
    expect(readPostInitState(root)?.output).toBe('[REDACTED]');
  });
  test('redacts before output truncation at the capture boundary', async () => {
    const value = 'fixture-boundary-secret';
    await runPostInitOnce(root, 'head -c 65530 /dev/zero | tr "\\0" x; printf "%s" "$FIBE_PRESET_INPUT_VALUE"', root, {env:{FIBE_PRESET_INPUT_VALUE:value}});
    const output = readPostInitState(root)?.output || '';
    expect(output.length).toBeLessThanOrEqual(65536);
    expect(output).not.toContain('fixture');
  });
});


describe('post-init actual process boundaries', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'preset-setup-process-')); });
  afterEach(() => { rmSync(root, {recursive:true,force:true}); });
  test('independent runtime processes share one atomic startup claim', async () => {
    const marker = join(root, 'claimed.txt');
    const entry = join(root, 'entry.ts');
    const runner = join(import.meta.dir, 'post-init-runner.ts');
    writeFileSync(entry, `import {runPostInitOnce} from ${JSON.stringify(runner)}; await runPostInitOnce(${JSON.stringify(root)}, 'printf claimed >> "$FIBE_PRESET_INPUT_MARKER"; sleep .08', ${JSON.stringify(root)}, {env:{FIBE_PRESET_INPUT_MARKER:${JSON.stringify(marker)}}});`);
    const children = [Bun.spawn([process.execPath,entry],{stdout:'pipe',stderr:'pipe'}),Bun.spawn([process.execPath,entry],{stdout:'pipe',stderr:'pipe'})];
    expect(await Promise.all(children.map(child=>child.exited))).toEqual([0,0]);
    expect(readFileSync(marker,'utf8')).toBe('claimed');
    expect(readPostInitState(root)?.state).toBe('succeeded');
  });
  test('deadline kills descendants that ignore TERM before they can finish effects', async () => {
    const marker = join(root,'late-effect.txt');
    await runPostInitOnce(root, 'trap "" TERM; (sleep .2; printf survived > "$FIBE_PRESET_INPUT_MARKER") & wait', root, {timeoutMs:20,killGraceMs:20,env:{FIBE_PRESET_INPUT_MARKER:marker}});
    await new Promise(resolve=>setTimeout(resolve,250));
    expect(existsSync(marker)).toBe(false);
    expect(readPostInitState(root)?.state).toBe('failed');
  });
});
