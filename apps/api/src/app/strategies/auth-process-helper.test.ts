import { describe, test, expect } from 'bun:test';
import { runAuthProcess } from './auth-process-helper';

describe('runAuthProcess', () => {
  test('spawns a process and returns cancel function', () => {
    const { process: proc, cancel } = runAuthProcess('echo', ['hello']);
    expect(proc).toBeDefined();
    expect(typeof cancel).toBe('function');
    cancel();
  });

  test('calls onData with stdout data', async () => {
    const chunks: string[] = [];
    const { process: proc } = runAuthProcess('echo', ['test-output'], {
      onData: (data) => chunks.push(data),
    });

    await new Promise<void>((resolve) => {
      proc.on('close', () => resolve());
    });
    expect(chunks.join('')).toContain('test-output');
  });

  test('calls onClose with exit code', async () => {
    let exitCode: number | null = null;
    const { process: proc } = runAuthProcess('true', [], {
      onClose: (code) => { exitCode = code; },
    });

    await new Promise<void>((resolve) => {
      proc.on('close', () => resolve());
    });
    expect(exitCode).toBe(0);
  });

  test('calls onError when command not found', async () => {
    let caughtError: Error | null = null;
    const { process: proc } = runAuthProcess('nonexistent-command-12345', [], {
      onError: (err) => { caughtError = err; },
    });

    await new Promise<void>((resolve) => {
      proc.on('error', () => resolve());
    });
    expect(caughtError).toBeDefined();
  });

  test('cancel kills the process', async () => {
    const { process: proc, cancel } = runAuthProcess('sleep', ['10']);

    await new Promise((resolve) => setTimeout(resolve, 50));
    cancel();

    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on('close', (code) => resolve(code));
    });
    // Killed process exits with non-zero or signal
    expect(exitCode === null || exitCode !== 0).toBe(true);
  });

  test('captures stderr through onData', async () => {
    const chunks: string[] = [];
    const { process: proc } = runAuthProcess('sh', ['-c', 'echo error-msg >&2'], {
      onData: (data) => chunks.push(data),
    });

    await new Promise<void>((resolve) => {
      proc.on('close', () => resolve());
    });
    expect(chunks.join('')).toContain('error-msg');
  });
});
