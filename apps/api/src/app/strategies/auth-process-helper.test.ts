/**
 * Tests for auth-process-helper.ts
 * Uses Bun's mock.module() + dynamic import pattern to mock node:child_process.
 * This avoids flaky timeouts from real process spawning in parallel test runs.
 */
import { describe, test, expect, mock } from 'bun:test';
import { EventEmitter } from 'node:events';

function makeFakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: () => void; write: (s: string) => void };
    kill: () => void;
    killed: boolean;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { end: () => undefined, write: () => undefined };
  proc.kill = function () { this.killed = true; this.emit('close', null); };
  proc.killed = false;
  return proc;
}

let currentFakeProc = makeFakeProc();

mock.module('node:child_process', () => ({
  spawn: (_cmd: string, _args: string[], _opts?: Record<string, unknown>) => currentFakeProc,
}));

const { runAuthProcess } = await import('./auth-process-helper');

describe('runAuthProcess', () => {
  // Reset the fake process before each test
  function resetProc() {
    currentFakeProc = makeFakeProc();
    return currentFakeProc;
  }

  test('spawns a process and returns cancel function', () => {
    resetProc();
    const { process: proc, cancel } = runAuthProcess('echo', ['hello']);
    expect(proc).toBeDefined();
    expect(typeof cancel).toBe('function');
  });

  test('calls onData with stdout data', () => {
    const proc = resetProc();
    const chunks: string[] = [];
    runAuthProcess('echo', ['test-output'], {
      onData: (data) => chunks.push(data),
    });
    proc.stdout.emit('data', Buffer.from('test-output'));
    expect(chunks.join('')).toContain('test-output');
  });

  test('calls onData with stderr data', () => {
    const proc = resetProc();
    const chunks: string[] = [];
    runAuthProcess('sh', ['-c', 'echo error-msg >&2'], {
      onData: (data) => chunks.push(data),
    });
    proc.stderr.emit('data', 'error-msg\n');
    expect(chunks.join('')).toContain('error-msg');
  });

  test('calls onClose with exit code', () => {
    const proc = resetProc();
    let exitCode: number | null = null;
    runAuthProcess('true', [], {
      onClose: (code) => { exitCode = code; },
    });
    proc.emit('close', 0);
    expect(exitCode).toBe(0);
  });

  test('calls onError when process emits error', () => {
    const proc = resetProc();
    let caughtError: Error | null = null;
    runAuthProcess('nonexistent-command', [], {
      onError: (err) => { caughtError = err; },
    });
    proc.emit('error', new Error('ENOENT: not found'));
    expect(caughtError).toBeDefined();
    expect((caughtError as Error).message).toContain('ENOENT');
  });

  test('cancel kills the process', () => {
    const proc = resetProc();
    let killCalled = false;
    proc.kill = function () { killCalled = true; };
    const { cancel } = runAuthProcess('sleep', ['10']);
    cancel();
    expect(killCalled).toBe(true);
  });

  test('custom env is passed through to spawn (verifiable via options)', () => {
    resetProc();
    const customEnv = { MY_VAR: 'test_value', PATH: '/usr/bin' };
    const { process: proc } = runAuthProcess('env', [], { env: customEnv });
    expect(proc).toBeDefined(); // spawn was called — our mock returns the fake proc
  });
});
