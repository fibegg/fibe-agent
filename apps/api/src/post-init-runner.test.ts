import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readPostInitState,
  writePostInitState,
  runPostInitOnce,
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

  test('readPostInitState returns null when file is invalid JSON', () => {
    writeFileSync(join(tmpDir, 'post-init-state.json'), 'not json', 'utf-8');
    expect(readPostInitState(tmpDir)).toBeNull();
  });

  test('readPostInitState returns parsed state when file exists', () => {
    writePostInitState(tmpDir, {
      state: 'done',
      output: 'ok',
      finishedAt: '2026-03-18T12:00:00.000Z',
    });
    expect(readPostInitState(tmpDir)).toEqual({
      state: 'done',
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
    expect(state?.state).toBe('done');
    expect(state?.output).toContain('hello');
    expect(state?.finishedAt).toBeDefined();
  });

  test('runPostInitOnce skips run when state already done', async () => {
    writePostInitState(tmpDir, { state: 'done', finishedAt: '2026-01-01T00:00:00.000Z' });
    await runPostInitOnce(tmpDir, 'echo should-not-run', tmpDir);
    const state = readPostInitState(tmpDir);
    expect(state?.state).toBe('done');
    expect(state?.finishedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(state?.output == null || !String(state.output).includes('should-not-run')).toBe(true);
  });

  test('runPostInitOnce skips run when state already failed', async () => {
    writePostInitState(tmpDir, { state: 'failed', error: 'previous', finishedAt: '2026-01-01T00:00:00.000Z' });
    await runPostInitOnce(tmpDir, 'echo should-not-run', tmpDir);
    const state = readPostInitState(tmpDir);
    expect(state?.state).toBe('failed');
    expect(state?.error).toBe('previous');
    expect(state?.output == null || !String(state.output).includes('should-not-run')).toBe(true);
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
    expect(state?.state).toBe('done');
    expect(state?.output).toContain('stderr-msg');
  });

  test('runPostInitOnce handles spawn error gracefully', async () => {
    // Use a non-existent directory as cwd to trigger spawn error
    await runPostInitOnce(tmpDir, 'echo test', '/nonexistent-dir-12345');
    const state = readPostInitState(tmpDir);
    // Should be either failed or done depending on sh behavior
    expect(state?.state).toBeDefined();
  });

  test('writePostInitState creates dataDir recursively if needed', () => {
    const nested = join(tmpDir, 'a', 'b', 'c');
    writePostInitState(nested, { state: 'running' });
    expect(readPostInitState(nested)).toEqual({ state: 'running' });
  });

  test('runPostInitOnce re-runs when state is running', async () => {
    writePostInitState(tmpDir, { state: 'running' });
    await runPostInitOnce(tmpDir, 'echo re-run', tmpDir);
    const state = readPostInitState(tmpDir);
    expect(state?.state).toBe('done');
    expect(state?.output).toContain('re-run');
  });
});
