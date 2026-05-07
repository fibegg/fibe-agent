/**
 * Unit tests for JsonLineRpcProcess.
 *
 * We test the public protocol parsing and state-machine logic by driving the
 * private handleStdout / handleLine methods indirectly through the real
 * ChildProcess stdout EventEmitter that gets wired up when `start()` is called.
 *
 * Because spawning a real process is expensive and platform-dependent, we
 * replace `spawn` at the module level using bun:test's vi.mock() and wire a
 * hand-crafted EventEmitter instead.
 */
import { describe, test, expect, beforeEach, afterEach, vi, type Mock } from 'bun:test';
import { EventEmitter } from 'node:events';

// ─── Fake ChildProcess ────────────────────────────────────────────────────────

function makeProc() {
  const stdin = { writable: true, write: vi.fn() };
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as typeof EventEmitter.prototype & {
    stdin: typeof stdin;
    stdout: typeof stdout;
    stderr: typeof stderr;
    killed: boolean;
    kill: Mock<() => void>;
    pid: number;
  };
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.killed = false;
  proc.kill = vi.fn(() => { proc.killed = true; });
  proc.pid = 99999;
  return proc;
}

// ─── Mock spawn ───────────────────────────────────────────────────────────────

let fakeProc: ReturnType<typeof makeProc>;

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => fakeProc),
}));

import { JsonLineRpcProcess } from './json-line-rpc-process';

function pushLine(proc: ReturnType<typeof makeProc>, line: string) {
  proc.stdout.emit('data', Buffer.from(line + '\n'));
}

describe('JsonLineRpcProcess', () => {
  beforeEach(() => {
    fakeProc = makeProc();
    vi.clearAllMocks();
  });

  // ─── request() / response correlation ────────────────────────────────────

  test('request() resolves when a matching result arrives', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p = rpc.request('ping');
    pushLine(fakeProc, JSON.stringify({ id: 1, result: 'pong' }));
    await expect(p).resolves.toBe('pong');
  });

  test('request() sends params in the message', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p = rpc.request('greet', { name: 'World' });
    pushLine(fakeProc, JSON.stringify({ id: 1, result: 'hi' }));
    await p;

    const written = JSON.parse((fakeProc.stdin.write as Mock<typeof fakeProc.stdin.write>).mock.calls[0][0] as string);
    expect(written).toMatchObject({ method: 'greet', params: { name: 'World' } });
  });

  test('request() id increments on each call', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p1 = rpc.request('a');
    pushLine(fakeProc, JSON.stringify({ id: 1, result: 'r1' }));
    await p1;

    const p2 = rpc.request('b');
    pushLine(fakeProc, JSON.stringify({ id: 2, result: 'r2' }));
    await expect(p2).resolves.toBe('r2');
  });

  test('request() rejects when error is a string', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p = rpc.request('fail');
    pushLine(fakeProc, JSON.stringify({ id: 1, error: 'raw string error' }));
    await expect(p).rejects.toThrow('raw string error');
  });

  test('request() rejects when error is an object with message', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p = rpc.request('fail');
    pushLine(fakeProc, JSON.stringify({ id: 1, error: { message: 'object error' } }));
    await expect(p).rejects.toThrow('object error');
  });

  test('request() rejects when error is arbitrary object (stringified)', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p = rpc.request('fail');
    pushLine(fakeProc, JSON.stringify({ id: 1, error: { code: 42 } }));
    await expect(p).rejects.toThrow();
  });

  test('request() times out when no response arrives', async () => {
    const rpc = new JsonLineRpcProcess('echo', [], { requestTimeoutMs: 30 });
    await expect(rpc.request('slow')).rejects.toThrow(/Timed out/);
  });

  test('request() ignores responses with unknown ids', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p = rpc.request('test');
    pushLine(fakeProc, JSON.stringify({ id: 999, result: 'should be ignored' }));
    pushLine(fakeProc, JSON.stringify({ id: 1, result: 'real' }));
    await expect(p).resolves.toBe('real');
  });

  // ─── notify() ───────────────────────────────────────────────────────────

  test('notify() writes a message without an id', () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    rpc.notify('ping');
    const written = JSON.parse((fakeProc.stdin.write as Mock<() => void>).mock.calls[0][0] as string);
    expect(written.method).toBe('ping');
    expect(written.id).toBeUndefined();
  });

  test('notify() includes params', () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    rpc.notify('event', { val: 1 });
    const written = JSON.parse((fakeProc.stdin.write as Mock<() => void>).mock.calls[0][0] as string);
    expect(written.params).toEqual({ val: 1 });
  });

  // ─── onNotification() ────────────────────────────────────────────────────

  test('onNotification() fires for server-push notifications', () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    rpc.notify('start'); // trigger start()
    const received: unknown[] = [];
    rpc.onNotification((msg) => received.push(msg));
    pushLine(fakeProc, JSON.stringify({ method: 'push', params: { v: 1 } }));
    expect(received).toHaveLength(1);
    expect((received[0] as { method: string }).method).toBe('push');
  });

  test('onNotification() can be unsubscribed', () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    rpc.notify('start');
    const received: unknown[] = [];
    const unsub = rpc.onNotification((msg) => received.push(msg));
    unsub();
    pushLine(fakeProc, JSON.stringify({ method: 'push' }));
    expect(received).toHaveLength(0);
  });

  // ─── onClose() ──────────────────────────────────────────────────────────

  test('onClose() fires when process exits', () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    rpc.notify('start');
    let err: Error | null = null;
    rpc.onClose((e) => { err = e; });
    fakeProc.emit('close', 1, null);
    expect(err).toBeInstanceOf(Error);
  });

  test('onClose() unsub prevents call', () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    rpc.notify('start');
    let called = false;
    const unsub = rpc.onClose(() => { called = true; });
    unsub();
    fakeProc.emit('close', 0, null);
    expect(called).toBe(false);
  });

  // ─── close() ────────────────────────────────────────────────────────────

  test('close() kills the process', () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    rpc.notify('start');
    rpc.close();
    expect(fakeProc.kill).toHaveBeenCalled();
  });

  test('close() rejects all pending requests', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p1 = rpc.request('a');
    const p2 = rpc.request('b');
    rpc.close();
    await expect(p1).rejects.toThrow('app-server process closed');
    await expect(p2).rejects.toThrow('app-server process closed');
  });

  test('close() with SIGKILL is forwarded', () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    rpc.notify('start');
    rpc.close('SIGKILL');
    expect(fakeProc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  // ─── Closed-state guard ──────────────────────────────────────────────────

  test('request() throws after close()', () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    rpc.notify('start');
    rpc.close();
    // start() throws synchronously when closed=true
    expect(() => rpc.request('any')).toThrow('app-server process is closed');
  });

  // ─── Non-JSON / partial lines ────────────────────────────────────────────

  test('ignores non-JSON lines on stdout', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p = rpc.request('test');
    pushLine(fakeProc, 'this is not json');
    pushLine(fakeProc, JSON.stringify({ id: 1, result: 'ok' }));
    await expect(p).resolves.toBe('ok');
  });

  test('handles partial lines accumulated across chunks', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p = rpc.request('test');
    const full = JSON.stringify({ id: 1, result: 'chunked' });
    fakeProc.stdout.emit('data', Buffer.from(full.slice(0, 8)));
    fakeProc.stdout.emit('data', Buffer.from(full.slice(8) + '\n'));
    await expect(p).resolves.toBe('chunked');
  });

  // ─── process error event ─────────────────────────────────────────────────

  test('rejectAll fires when process emits error', async () => {
    const rpc = new JsonLineRpcProcess('echo', []);
    const p = rpc.request('test');
    fakeProc.emit('error', new Error('ENOENT'));
    await expect(p).rejects.toThrow('ENOENT');
  });
});
