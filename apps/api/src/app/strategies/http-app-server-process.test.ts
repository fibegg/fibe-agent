import { describe, test, expect, beforeEach, vi, type Mock } from 'bun:test';
import { EventEmitter } from 'node:events';

// ─── Fake ChildProcess factory ────────────────────────────────────────────────

function makeProc() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as typeof EventEmitter.prototype & {
    stdout: typeof stdout;
    stderr: typeof stderr;
    stdin: null;
    killed: boolean;
    kill: Mock<() => void>;
    pid: number;
  };
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.stdin = null;
  proc.killed = false;
  proc.kill = vi.fn(() => { proc.killed = true; });
  proc.pid = 12345;
  return proc;
}

// ─── Fake net.Server factory ──────────────────────────────────────────────────

function makeNetServer(port = 19999) {
  const server: Record<string, unknown> & {
    listen: Mock<(p: number, h: string, cb: () => void) => typeof server>;
    address: Mock<() => { port: number }>;
    close: Mock<(cb?: () => void) => void>;
  } = {
    unref: vi.fn(),
    on: vi.fn().mockReturnThis(),
    listen: vi.fn(((_p: number, _h: string, cb: () => void) => { cb(); return server; }) as Mock<(...args: unknown[]) => typeof server>),
    address: vi.fn().mockReturnValue({ port }),
    close: vi.fn(((cb?: () => void) => cb?.()) as Mock<(...args: unknown[]) => void>),
  };
  return server;
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

let fakeProc: ReturnType<typeof makeProc>;

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => fakeProc),
}));

vi.mock('node:net', () => ({
  createServer: vi.fn(() => makeNetServer()),
}));

import { HttpAppServerProcess } from './http-app-server-process';

describe('HttpAppServerProcess', () => {
  let fetchSpy: Mock<typeof fetch>;

  beforeEach(() => {
    fakeProc = makeProc();
    vi.clearAllMocks();
    // Healthy by default
    fetchSpy = vi.spyOn(globalThis, 'fetch') as Mock<typeof fetch>;
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: 'ok' }),
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);
  });

  // ─── start() ───────────────────────────────────────────────────────────────

  test('start() spawns the command', async () => {
    const { spawn } = await import('node:child_process');
    const server = new HttpAppServerProcess('node', ['server.js']);
    await server.start();
    expect(spawn).toHaveBeenCalledWith('node', ['server.js'], expect.any(Object));
  });

  test('start() with args as function passes the allocated port', async () => {
    const { spawn } = await import('node:child_process');
    const argFn = vi.fn((port: number) => [`--port=${port}`]);
    const server = new HttpAppServerProcess('node', argFn);
    await server.start();
    expect(argFn).toHaveBeenCalledWith(19999);
    expect(spawn).toHaveBeenCalledWith('node', ['--port=19999'], expect.any(Object));
  });

  test('start() is idempotent', async () => {
    const { spawn } = await import('node:child_process');
    const server = new HttpAppServerProcess('node', []);
    await server.start();
    await server.start();
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  test('start() throws when health check fails and proc exits', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));
    const server = new HttpAppServerProcess('node', [], { startupTimeoutMs: 200 });
    const startPromise = server.start();
    // Trigger proc close immediately to break the poll loop
    fakeProc.emit('close', 1, null);
    await expect(startPromise).rejects.toThrow();
    // Restore fetch for subsequent tests
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}), text: vi.fn().mockResolvedValue('') } as unknown as Response);
  });

  // ─── baseUrl() / url() ─────────────────────────────────────────────────────

  test('baseUrl() returns correct URL after start', async () => {
    const server = new HttpAppServerProcess('node', []);
    await server.start();
    expect(server.baseUrl()).toBe('http://127.0.0.1:19999');
  });

  test('baseUrl() throws if not started', () => {
    const server = new HttpAppServerProcess('node', []);
    expect(() => server.baseUrl()).toThrow('HTTP app-server has not started');
  });

  test('url() appends path and query correctly', async () => {
    const server = new HttpAppServerProcess('node', []);
    await server.start();
    const u = server.url('/chat', { model: 'gpt-4', stream: true });
    const parsed = new URL(u);
    expect(parsed.pathname).toBe('/chat');
    expect(parsed.searchParams.get('model')).toBe('gpt-4');
    expect(parsed.searchParams.get('stream')).toBe('true');
  });

  test('url() skips undefined query params', async () => {
    const server = new HttpAppServerProcess('node', []);
    await server.start();
    const u = server.url('/test', { key: undefined });
    expect(u).not.toContain('key');
  });

  // ─── json() ────────────────────────────────────────────────────────────────

  test('json() performs GET when no body given', async () => {
    const server = new HttpAppServerProcess('node', []);
    await server.start();

    fetchSpy.mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ pong: true }) } as unknown as Response);
    const result = await server.json('/ping');
    expect(result).toEqual({ pong: true });

    const calls = fetchSpy.mock.calls;
    const last = calls[calls.length - 1] as [string, RequestInit];
    expect(last[1]?.method).toBe('GET');
  });

  test('json() performs POST when body is provided', async () => {
    const server = new HttpAppServerProcess('node', []);
    await server.start();

    fetchSpy.mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ ok: true }) } as unknown as Response);
    await server.json('/msg', { body: { text: 'hi' } });

    const calls = fetchSpy.mock.calls;
    const last = calls[calls.length - 1] as [string, RequestInit];
    expect(last[1]?.method).toBe('POST');
    expect(last[1]?.body as string).toContain('hi');
  });

  test('json() returns undefined for 204 No Content', async () => {
    const server = new HttpAppServerProcess('node', []);
    await server.start();
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 } as unknown as Response);
    const result = await server.json('/noop');
    expect(result).toBeUndefined();
  });

  test('json() throws on non-OK response', async () => {
    const server = new HttpAppServerProcess('node', []);
    await server.start();
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, text: vi.fn().mockResolvedValue('Server error') } as unknown as Response);
    await expect(server.json('/fail')).rejects.toThrow('Server error');
  });

  test('json() includes status in error when body is empty', async () => {
    const server = new HttpAppServerProcess('node', []);
    await server.start();
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503, text: vi.fn().mockResolvedValue('') } as unknown as Response);
    await expect(server.json('/fail')).rejects.toThrow('503');
  });

  // ─── close() ───────────────────────────────────────────────────────────────

  test('close() kills the process with SIGTERM by default', async () => {
    const server = new HttpAppServerProcess('node', []);
    await server.start();
    server.close();
    expect(fakeProc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('close() with SIGKILL is forwarded', async () => {
    const server = new HttpAppServerProcess('node', []);
    await server.start();
    server.close('SIGKILL');
    expect(fakeProc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  test('close() sets proc to null so start() can respawn', async () => {
    const { spawn } = await import('node:child_process');
    const server = new HttpAppServerProcess('node', []);
    await server.start();
    server.close();
    await server.start();
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  // ─── unexpected exit ───────────────────────────────────────────────────────

  test('warns logger on unexpected exit', async () => {
    const logger = { warn: vi.fn() } as unknown as import('@nestjs/common').Logger;
    const server = new HttpAppServerProcess('node', [], { logger });
    await server.start();
    fakeProc.emit('close', 1, null);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('exited unexpectedly'));
  });

  test('does NOT warn on expected close()', async () => {
    const logger = { warn: vi.fn() } as unknown as import('@nestjs/common').Logger;
    const server = new HttpAppServerProcess('node', [], { logger });
    await server.start();
    server.close();
    fakeProc.emit('close', 0, null);
    const warnCalls = (logger.warn as Mock<() => void>).mock.calls.filter(
      (c: unknown[]) => (c[0] as string)?.includes('exited unexpectedly')
    );
    expect(warnCalls).toHaveLength(0);
  });
});
