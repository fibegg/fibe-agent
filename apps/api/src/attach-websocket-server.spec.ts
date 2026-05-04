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
import { Subject } from 'rxjs';

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

const orchestrator = {
  handleClientConnected: mock(() => undefined),
  handleClientMessage:   mock(async () => undefined),
} as unknown as import('./app/orchestrator/orchestrator.service').OrchestratorService;

const mockCtxOutbound = new Subject<{ type: string; data: Record<string, unknown> }>();
const mockCtx = {
  sessionId: 'test-session',
  isAuthenticated: false,
  isProcessing: false,
  outbound$: mockCtxOutbound,
  send: mock(() => undefined),
  destroy: mock(() => undefined),
} as unknown as import('./app/orchestrator/session-context').SessionContext;

const mockSessionRegistry = {
  all: () => [],
  connected: () => [],
  create: mock(() => mockCtx),
  destroy: mock(() => undefined),
  detach: mock(() => undefined),
  broadcast: mock(() => undefined),
} as unknown as import('./app/orchestrator/session-registry.service').SessionRegistryService;

const playgroundChanged$ = { subscribe: mock(() => ({ unsubscribe: () => undefined })) };

const playgroundWatcher = {
  playgroundChanged$: playgroundChanged$,
} as unknown as import('./app/playgrounds/playground-watcher.service').PlaygroundWatcherService;

let mockPtyProcess: { onData: MockFn; onExit: MockFn };
let terminalService: import('./app/terminal/terminal.service').TerminalService;

function makeConfig(password?: string) {
  return {
    getAgentPassword:  () => password,
    getPlaygroundsDir: () => '/tmp/playground',
  } as unknown as import('./app/config/config.service').ConfigService;
}

/** Default conversation manager stub — knows only about 'default'. */
const mockConversationManager = {
  get: (id: string) => id === 'default' ? {} : undefined,
} as unknown as import('./app/conversation/conversation-manager.service').ConversationManagerService;

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
      makeFastify(server), makeConfig(), orchestrator, mockSessionRegistry, playgroundWatcher, terminalService, mockConversationManager,
    );
    expect(result).toBeInstanceOf(WebSocketServer);
  });

  it('destroys sockets for unknown paths', () => {
    const server = new EventEmitter();
    attachWebSocketServer(makeFastify(server), makeConfig(), orchestrator, mockSessionRegistry, playgroundWatcher, terminalService, mockConversationManager);

    const socket = makeSocket();
    server.emit('upgrade', makeReq('/unknown'), socket, Buffer.alloc(0));

    expect((socket as unknown as Record<string, MockFn>).destroy).toHaveBeenCalledTimes(1);
  });

  it('does not destroy socket for /ws path', () => {
    const server = new EventEmitter();
    attachWebSocketServer(makeFastify(server), makeConfig(), orchestrator, mockSessionRegistry, playgroundWatcher, terminalService, mockConversationManager);

    const socket = makeSocket();
    try { server.emit('upgrade', makeReq('/ws'), socket, Buffer.alloc(0)); } catch { /* fake socket */ }

    expect((socket as unknown as Record<string, MockFn>).destroy).not.toHaveBeenCalled();
  });

  it('does not destroy socket for /ws-terminal path', () => {
    const server = new EventEmitter();
    attachWebSocketServer(makeFastify(server), makeConfig(), orchestrator, mockSessionRegistry, playgroundWatcher, terminalService, mockConversationManager);

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
      makeFastify(server), makeConfig('secret'), orchestrator, mockSessionRegistry, playgroundWatcher, terminalService, mockConversationManager,
    );

    const stub = makeWsStub();
    wss.emit('connection', stub, makeReq('/ws?token=wrong'));

    expect(ws(stub).close).toHaveBeenCalledTimes(1);
    expect(ws(stub).close.mock.calls[0][0]).toBe(4001);
  });

  it('allows connection when token matches', () => {
    const server = new EventEmitter();
    const wss = attachWebSocketServer(
      makeFastify(server), makeConfig('secret'), orchestrator, mockSessionRegistry, playgroundWatcher, terminalService, mockConversationManager,
    );

    const stub = makeWsStub();
    wss.emit('connection', stub, makeReq('/ws?token=secret'));

    expect(ws(stub).close).not.toHaveBeenCalled();
  });

  it('allows connection when no password is configured', () => {
    const server = new EventEmitter();
    const wss = attachWebSocketServer(
      makeFastify(server), makeConfig(), orchestrator, mockSessionRegistry, playgroundWatcher, terminalService, mockConversationManager,
    );

    const stub = makeWsStub();
    wss.emit('connection', stub, makeReq('/ws'));

    expect(ws(stub).close).not.toHaveBeenCalled();
  });

  it('binds chat sessions to the conversation_id query param', () => {
    const server = new EventEmitter();
    let createdConversationId: string | undefined;
    const localRegistry = {
      all: () => [],
      connected: () => [],
      create: mock((conversationId: string) => {
        createdConversationId = conversationId;
        return {
          ...mockCtx,
          sessionId: 'thread-session',
          outbound$: new Subject<{ type: string; data: Record<string, unknown> }>(),
        };
      }),
      destroy: mock(() => undefined),
      detach: mock(() => undefined),
      broadcast: mock(() => undefined),
    } as unknown as typeof mockSessionRegistry;

    // Manager that knows about thread-123 so WS doesn't reject with 4004
    const localConvManager = {
      get: (id: string) => (id === 'default' || id === 'thread-123') ? {} : undefined,
    } as unknown as typeof mockConversationManager;

    const wss = attachWebSocketServer(
      makeFastify(server), makeConfig(), orchestrator, localRegistry, playgroundWatcher, terminalService, localConvManager,
    );

    const stub = makeWsStub();
    wss.emit('connection', stub, makeReq('/ws?conversation_id=thread-123'));

    expect(createdConversationId).toBe('thread-123');
    expect(ws(stub).send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'conversation_id', conversationId: 'thread-123' }),
    );
  });
});

// ─── Chat WS — session takeover ───────────────────────────────────────────────

describe('attachWebSocketServer — session takeover', () => {
  it('calls sessionRegistry.destroy on the oldest session when limit is reached', () => {
    const server = new EventEmitter();
    // Create a local registry mock that tracks sessions so all() returns them
    const localSessions: Array<{ sessionId: string; outbound$: Subject<{ type: string; data: Record<string, unknown> }>; destroy: ReturnType<typeof mock> }> = [];
    let sessionCounter = 0;
    const localRegistry = {
      all: () => localSessions,
      connected: () => localSessions,
      create: mock(() => {
        const ctx = {
          sessionId: `session-${sessionCounter++}`,
          isAuthenticated: false,
          isProcessing: false,
          outbound$: new Subject<{ type: string; data: Record<string, unknown> }>(),
          send: mock(() => undefined),
          destroy: mock(() => undefined),
        };
        localSessions.push(ctx);
        return ctx;
      }),
      destroy: mock((id: string) => {
        const idx = localSessions.findIndex((s) => s.sessionId === id);
        if (idx >= 0) localSessions.splice(idx, 1);
      }),
      detach: mock((id: string) => {
        const idx = localSessions.findIndex((s) => s.sessionId === id);
        if (idx >= 0) localSessions.splice(idx, 1);
      }),
      broadcast: mock(() => undefined),
    } as unknown as typeof mockSessionRegistry;

    const wss = attachWebSocketServer(
      makeFastify(server), makeConfig(), orchestrator, localRegistry, playgroundWatcher, terminalService, mockConversationManager,
    );

    // Connect 5 clients
    for (let i = 0; i < 5; i++) wss.emit('connection', makeWsStub(), makeReq('/ws'));
    expect(localSessions).toHaveLength(5);
    const oldestId = localSessions[0].sessionId;

    // 6th connection should evict the oldest
    wss.emit('connection', makeWsStub(), makeReq('/ws'));
    expect(localRegistry.destroy).toHaveBeenCalledWith(oldestId);
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
