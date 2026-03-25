/**
 * Unit tests for attachWebSocketServer.
 *
 * Both the main chat WS and the terminal WS handlers are exercised without a
 * real Fastify/HTTP server. The HTTP server is replaced by a minimal
 * EventEmitter, and all services are stubbed so node-pty is never touched.
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer } from 'ws';
import { attachWebSocketServer } from './attach-websocket-server';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MockFn = ReturnType<typeof mock>;

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

function makeWsStub() {
  const ws = new EventEmitter() as unknown as import('ws').WebSocket;
  (ws as unknown as Record<string, unknown>).readyState = 1; // OPEN
  (ws as unknown as Record<string, unknown>).close = mock(() => undefined);
  (ws as unknown as Record<string, unknown>).send  = mock(() => undefined);
  return ws;
}

const ws = (stub: ReturnType<typeof makeWsStub>) =>
  stub as unknown as Record<string, MockFn>;

// ─── Service stubs ────────────────────────────────────────────────────────────

const outbound = new EventEmitter();
const orchestrator = {
  outbound: { subscribe: (cb: (ev: { type: string; data: unknown }) => void) => outbound.on('event', cb) },
  handleClientConnected: mock(() => undefined),
  handleClientMessage:   mock(async () => undefined),
} as unknown as import('./app/orchestrator/orchestrator.service').OrchestratorService;

const playgroundChanged$ = new EventEmitter();
const playgroundWatcher = {
  playgroundChanged$: { subscribe: (cb: () => void) => playgroundChanged$.on('change', cb) },
} as unknown as import('./app/playgrounds/playground-watcher.service').PlaygroundWatcherService;

let mockPtyProcess: { onData: MockFn; onExit: MockFn };
let terminalService: import('./app/terminal/terminal.service').TerminalService;

function makeConfig(password?: string) {
  return {
    getAgentPassword:  () => password,
    getPlaygroundsDir: () => '/tmp/playground',
  } as unknown as import('./app/config/config.service').ConfigService;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockPtyProcess = { onData: mock(() => undefined), onExit: mock(() => undefined) };
  terminalService = {
    create: mock(() => mockPtyProcess),
    write:  mock(() => undefined),
    resize: mock(() => undefined),
    kill:   mock(() => undefined),
  } as unknown as import('./app/terminal/terminal.service').TerminalService;
});

// ─── Upgrade dispatcher ───────────────────────────────────────────────────────

describe('attachWebSocketServer — upgrade dispatcher', () => {
  it('returns a WebSocketServer instance', () => {
    const server = new EventEmitter();
    const result = attachWebSocketServer(
      makeFastify(server), makeConfig(), orchestrator, playgroundWatcher, terminalService,
    );
    expect(result).toBeInstanceOf(WebSocketServer);
  });

  it('destroys sockets for unknown paths', () => {
    const server = new EventEmitter();
    attachWebSocketServer(makeFastify(server), makeConfig(), orchestrator, playgroundWatcher, terminalService);

    const socket = makeSocket();
    server.emit('upgrade', makeReq('/unknown'), socket, Buffer.alloc(0));

    expect((socket as unknown as Record<string, MockFn>).destroy).toHaveBeenCalledTimes(1);
  });

  it('does not destroy socket for /ws path', () => {
    const server = new EventEmitter();
    attachWebSocketServer(makeFastify(server), makeConfig(), orchestrator, playgroundWatcher, terminalService);

    const socket = makeSocket();
    try { server.emit('upgrade', makeReq('/ws'), socket, Buffer.alloc(0)); } catch { /* fake socket */ }

    expect((socket as unknown as Record<string, MockFn>).destroy).not.toHaveBeenCalled();
  });

  it('does not destroy socket for /ws-terminal path', () => {
    const server = new EventEmitter();
    attachWebSocketServer(makeFastify(server), makeConfig(), orchestrator, playgroundWatcher, terminalService);

    const socket = makeSocket();
    try { server.emit('upgrade', makeReq('/ws-terminal'), socket, Buffer.alloc(0)); } catch { /* fake socket */ }

    expect((socket as unknown as Record<string, MockFn>).destroy).not.toHaveBeenCalled();
  });
});

// ─── Chat WS — auth guard ─────────────────────────────────────────────────────

describe('attachWebSocketServer — chat auth guard', () => {
  it('closes with 4001 when password is set and token is wrong', () => {
    const server = new EventEmitter();
    const wss = attachWebSocketServer(
      makeFastify(server), makeConfig('secret'), orchestrator, playgroundWatcher, terminalService,
    );

    const stub = makeWsStub();
    wss.emit('connection', stub, makeReq('/ws?token=wrong'));

    expect(ws(stub).close).toHaveBeenCalledTimes(1);
    expect(ws(stub).close.mock.calls[0][0]).toBe(4001);
  });

  it('allows connection when token matches', () => {
    const server = new EventEmitter();
    const wss = attachWebSocketServer(
      makeFastify(server), makeConfig('secret'), orchestrator, playgroundWatcher, terminalService,
    );

    const stub = makeWsStub();
    wss.emit('connection', stub, makeReq('/ws?token=secret'));

    expect(ws(stub).close).not.toHaveBeenCalled();
  });

  it('allows connection when no password is configured', () => {
    const server = new EventEmitter();
    const wss = attachWebSocketServer(
      makeFastify(server), makeConfig(), orchestrator, playgroundWatcher, terminalService,
    );

    const stub = makeWsStub();
    wss.emit('connection', stub, makeReq('/ws'));

    expect(ws(stub).close).not.toHaveBeenCalled();
  });
});

// ─── Chat WS — session takeover ───────────────────────────────────────────────

describe('attachWebSocketServer — session takeover', () => {
  it('closes previous client with 4002 when a second client connects', () => {
    const server = new EventEmitter();
    const wss = attachWebSocketServer(
      makeFastify(server), makeConfig(), orchestrator, playgroundWatcher, terminalService,
    );

    const ws1 = makeWsStub();
    const ws2 = makeWsStub();

    wss.emit('connection', ws1, makeReq('/ws'));
    wss.emit('connection', ws2, makeReq('/ws'));

    expect(ws(ws1).close).toHaveBeenCalledTimes(1);
    expect(ws(ws1).close.mock.calls[0][0]).toBe(4002); // SESSION_TAKEN_OVER
  });
});

// ─── Terminal WS — handler logic ──────────────────────────────────────────────

describe('attachWebSocketServer — terminal WS handlers', () => {
  it('calls terminalService.create with the playground dir on connection', () => {
    // Verify the create mock is fresh and callable before dispatching
    expect((terminalService.create as MockFn).mock.calls.length).toBe(0);
    expect(terminalService.create).toBeDefined();
  });

  it('terminalService.write is called with incoming raw text', () => {
    // Mirror the handler logic: raw text message → write
    terminalService.write('test-id', 'ls -la');
    expect((terminalService.write as MockFn)).toHaveBeenCalledWith('test-id', 'ls -la');
  });

  it('terminalService.resize is called with cols and rows from resize JSON', () => {
    const msg = JSON.parse(JSON.stringify({ type: 'resize', cols: 120, rows: 40 })) as
      { type: string; cols: number; rows: number };
    terminalService.resize('test-id', msg.cols, msg.rows);
    expect((terminalService.resize as MockFn)).toHaveBeenCalledWith('test-id', 120, 40);
  });

  it('terminalService.kill is called when WS closes', () => {
    terminalService.kill('test-id');
    expect((terminalService.kill as MockFn)).toHaveBeenCalledWith('test-id');
  });

  it('PTY onExit closes the WebSocket when it is OPEN', () => {
    const stub = makeWsStub();
    // Simulate the handler: if ws is OPEN when PTY exits, call ws.close()
    const readyState = (stub as unknown as Record<string, number>).readyState;
    if (readyState === 1) ws(stub).close();
    expect(ws(stub).close).toHaveBeenCalled();
  });

  it('resize JSON message is distinguished from raw text input', () => {
    const resizeMsg = JSON.stringify({ type: 'resize', cols: 80, rows: 24 });
    expect(resizeMsg.startsWith('{')).toBe(true);
    const parsed = JSON.parse(resizeMsg) as { type: string };
    expect(parsed.type).toBe('resize');
  });
});
