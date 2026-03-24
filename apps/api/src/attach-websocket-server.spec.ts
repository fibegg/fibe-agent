/**
 * Unit tests for attachWebSocketServer.
 *
 * These tests exercise the upgrade dispatcher and both WebSocket handlers
 * without a real Fastify/HTTP server.  The HTTP server is replaced by a
 * minimal EventEmitter that mimics the `upgrade` event, and WebSocket
 * behaviour is stubbed so node-pty and the orchestrator are never touched.
 */
import { describe, it, expect, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer } from 'ws';
import { attachWebSocketServer } from './attach-websocket-server';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(url: string, host = 'localhost'): IncomingMessage {
  return { url, headers: { host } } as unknown as IncomingMessage;
}

function makeSocket(): Socket {
  const s = new EventEmitter() as unknown as Socket;
  (s as unknown as Record<string, unknown>).destroy = mock(() => undefined);
  return s;
}

function makeFastify(server: EventEmitter) {
  return { server } as unknown as import('fastify').FastifyInstance;
}

// ─── Service stubs ───────────────────────────────────────────────────────────

const outbound = new EventEmitter();
const orchestrator = {
  outbound: { subscribe: (cb: (ev: { type: string; data: unknown }) => void) => outbound.on('event', cb) },
  handleClientConnected: mock(() => undefined),
  handleClientMessage: mock(async () => undefined),
} as unknown as import('./app/orchestrator/orchestrator.service').OrchestratorService;

const playgroundChanged$ = new EventEmitter();
const playgroundWatcher = {
  playgroundChanged$: { subscribe: (cb: () => void) => playgroundChanged$.on('change', cb) },
} as unknown as import('./app/playgrounds/playground-watcher.service').PlaygroundWatcherService;

const terminalService = {
  create: mock(() => ({
    onData: mock(() => undefined),
    onExit: mock(() => undefined),
  })),
  write: mock(() => undefined),
  resize: mock(() => undefined),
  kill: mock(() => undefined),
} as unknown as import('./app/terminal/terminal.service').TerminalService;

function makeConfig(password?: string) {
  return {
    getAgentPassword: () => password,
    getPlaygroundsDir: () => '/tmp/playground',
  } as unknown as import('./app/config/config.service').ConfigService;
}

// ─── upgrade dispatcher tests ─────────────────────────────────────────────────

describe('attachWebSocketServer — upgrade dispatcher', () => {
  it('returns a WebSocketServer instance', () => {
    const server = new EventEmitter();
    const result = attachWebSocketServer(
      makeFastify(server),
      makeConfig(),
      orchestrator,
      playgroundWatcher,
      terminalService,
    );
    expect(result).toBeInstanceOf(WebSocketServer);
  });

  it('destroys sockets for unknown paths', () => {
    const server = new EventEmitter();
    attachWebSocketServer(makeFastify(server), makeConfig(), orchestrator, playgroundWatcher, terminalService);

    const socket = makeSocket();
    server.emit('upgrade', makeReq('/unknown'), socket, Buffer.alloc(0));

    expect((socket as unknown as Record<string, ReturnType<typeof mock>>).destroy).toHaveBeenCalledTimes(1);
  });

  it('does not destroy socket for /ws path', () => {
    const server = new EventEmitter();
    attachWebSocketServer(makeFastify(server), makeConfig(), orchestrator, playgroundWatcher, terminalService);

    const socket = makeSocket();
    // handleUpgrade will throw because the socket is not a real TLS/TCP socket,
    // but what matters is that destroy() is NOT called by the dispatcher itself.
    try {
      server.emit('upgrade', makeReq('/ws'), socket, Buffer.alloc(0));
    } catch { /* expected — fake socket */ }

    expect((socket as unknown as Record<string, ReturnType<typeof mock>>).destroy).not.toHaveBeenCalled();
  });

  it('does not destroy socket for /ws-terminal path', () => {
    const server = new EventEmitter();
    attachWebSocketServer(makeFastify(server), makeConfig(), orchestrator, playgroundWatcher, terminalService);

    const socket = makeSocket();
    try {
      server.emit('upgrade', makeReq('/ws-terminal'), socket, Buffer.alloc(0));
    } catch { /* expected — fake socket */ }

    expect((socket as unknown as Record<string, ReturnType<typeof mock>>).destroy).not.toHaveBeenCalled();
  });
});

// ─── rejectIfUnauthorized (via connection event) ──────────────────────────────

describe('attachWebSocketServer — auth guard', () => {
  function makeWsStub() {
    const ws = new EventEmitter() as unknown as import('ws').WebSocket;
    (ws as unknown as Record<string, unknown>).readyState = 1; // OPEN
    (ws as unknown as Record<string, unknown>).close = mock(() => undefined);
    (ws as unknown as Record<string, unknown>).send = mock(() => undefined);
    return ws;
  }

  it('closes with 4001 when password is set and token is wrong', () => {
    const server = new EventEmitter();
    const wss = attachWebSocketServer(
      makeFastify(server),
      makeConfig('secret'),
      orchestrator,
      playgroundWatcher,
      terminalService,
    );

    const ws = makeWsStub();
    wss.emit('connection', ws, makeReq('/ws?token=wrong'));

    const close = (ws as unknown as Record<string, ReturnType<typeof mock>>).close;
    expect(close).toHaveBeenCalledTimes(1);
    expect(close.mock.calls[0][0]).toBe(4001);
  });

  it('allows connection when password matches', () => {
    const server = new EventEmitter();
    const wss = attachWebSocketServer(
      makeFastify(server),
      makeConfig('secret'),
      orchestrator,
      playgroundWatcher,
      terminalService,
    );

    const ws = makeWsStub();
    wss.emit('connection', ws, makeReq('/ws?token=secret'));

    const close = (ws as unknown as Record<string, ReturnType<typeof mock>>).close;
    expect(close).not.toHaveBeenCalled();
  });

  it('allows connection when no password is configured', () => {
    const server = new EventEmitter();
    const wss = attachWebSocketServer(
      makeFastify(server),
      makeConfig(undefined),
      orchestrator,
      playgroundWatcher,
      terminalService,
    );

    const ws = makeWsStub();
    wss.emit('connection', ws, makeReq('/ws'));

    const close = (ws as unknown as Record<string, ReturnType<typeof mock>>).close;
    expect(close).not.toHaveBeenCalled();
  });
});

// ─── session takeover ─────────────────────────────────────────────────────────

describe('attachWebSocketServer — session takeover', () => {
  function makeWsStub() {
    const ws = new EventEmitter() as unknown as import('ws').WebSocket;
    (ws as unknown as Record<string, unknown>).readyState = 1;
    (ws as unknown as Record<string, unknown>).close = mock(() => undefined);
    (ws as unknown as Record<string, unknown>).send = mock(() => undefined);
    return ws;
  }

  it('closes previous client with SESSION_TAKEN_OVER when a second client connects', () => {
    const server = new EventEmitter();
    const wss = attachWebSocketServer(
      makeFastify(server),
      makeConfig(),
      orchestrator,
      playgroundWatcher,
      terminalService,
    );

    const ws1 = makeWsStub();
    const ws2 = makeWsStub();

    wss.emit('connection', ws1, makeReq('/ws'));
    wss.emit('connection', ws2, makeReq('/ws'));

    const closeWs1 = (ws1 as unknown as Record<string, ReturnType<typeof mock>>).close;
    expect(closeWs1).toHaveBeenCalledTimes(1);
    expect(closeWs1.mock.calls[0][0]).toBe(4002); // SESSION_TAKEN_OVER
  });
});
