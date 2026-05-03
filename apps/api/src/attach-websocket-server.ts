import type { FastifyInstance } from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import { ConfigService } from './app/config/config.service';
import { OrchestratorService } from './app/orchestrator/orchestrator.service';
import { SessionRegistryService } from './app/orchestrator/session-registry.service';
import { PlaygroundWatcherService } from './app/playgrounds/playground-watcher.service';
import { TerminalService } from './app/terminal/terminal.service';
import { WS_CLOSE, WS_EVENT } from '@shared/ws-constants';
import { logWs } from './container-logger';

type ClientMessage = {
  action: string;
  code?: string;
  text?: string;
  model?: string;
  effort?: string;
  images?: string[];
  audio?: string;
  audioFilename?: string;
  attachmentFilenames?: string[];
};

/** Extract the token query param from an IncomingMessage URL. */
function extractToken(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
  return url.searchParams.get('token');
}

/** Return true and close with 4001 if the required password is set but doesn't match. */
function rejectIfUnauthorized(ws: WebSocket, req: IncomingMessage, requiredPassword: string | undefined): boolean {
  if (!requiredPassword) return false;
  if (extractToken(req) !== requiredPassword) {
    logWs({ event: 'disconnect', closeCode: WS_CLOSE.UNAUTHORIZED, error: 'Unauthorized' });
    ws.close(WS_CLOSE.UNAUTHORIZED, 'Unauthorized');
    return true;
  }
  return false;
}

const MAX_CONNECTIONS = 5;
const MESSAGE_LIMIT = 60;

function attachChatWs(
  wss: WebSocketServer,
  config: ConfigService,
  orchestrator: OrchestratorService,
  sessionRegistry: SessionRegistryService,
  playgroundWatcher: PlaygroundWatcherService,
): void {
  // Broadcast playground changes to all active sessions
  playgroundWatcher.playgroundChanged$.subscribe(() =>
    sessionRegistry.broadcast(WS_EVENT.PLAYGROUND_CHANGED, {})
  );

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    if (rejectIfUnauthorized(ws, req, config.getAgentPassword())) return;

    // Enforce max connections by evicting the oldest session
    const allSessions = sessionRegistry.all();
    if (allSessions.length >= MAX_CONNECTIONS) {
      const oldest = allSessions[0];
      logWs({ event: 'disconnect', closeCode: WS_CLOSE.SESSION_TAKEN_OVER, error: 'Max connections reached — oldest session evicted' });
      // Close the WS for the oldest session — the 'close' handler below will destroy it
      // We need to find the WS for that session; simplest is to just send a close frame
      // Since we track sessions by sessionId, we close via the registry
      sessionRegistry.destroy(oldest.sessionId);
    }

    // Create an isolated session for this connection
    const ctx = sessionRegistry.create();
    logWs({ event: 'connect' });

    // Wire per-session events → this specific WS client
    const sub = ctx.outbound$.subscribe((ev) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: ev.type, ...ev.data }));
      }
    });

    // Notify the new session of current state
    orchestrator.handleClientConnected(ctx);

    let messageCount = 0;
    const resetInterval = setInterval(() => { messageCount = 0; }, 60_000);

    ws.on('message', (raw: RawData) => {
      messageCount++;
      if (messageCount > MESSAGE_LIMIT) {
        logWs({ event: 'rate_limited', count: messageCount });
        return;
      }
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        logWs({ event: 'action', action: msg.action });
        void orchestrator.handleClientMessage(ctx, msg);
      } catch {
        // ignore invalid JSON
      }
    });

    ws.on('close', (code?: number) => {
      clearInterval(resetInterval);
      sub.unsubscribe();
      sessionRegistry.destroy(ctx.sessionId);
      logWs({ event: 'disconnect', closeCode: code });
    });

    ws.on('error', (err) => {
      logWs({ event: 'disconnect', error: err instanceof Error ? err.message : String(err) });
    });
  });
}

function attachTerminalWs(
  terminalWss: WebSocketServer,
  config: ConfigService,
  terminalService: TerminalService,
): void {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');

  terminalWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    if (rejectIfUnauthorized(ws, req, config.getAgentPassword())) return;

    const sessionId = randomUUID();
    const playgroundDir = config.getPlaygroundsDir();

    let ptyProcess: import('node-pty').IPty;
    try {
      ptyProcess = terminalService.create(sessionId, 80, 24, playgroundDir);
    } catch (err) {
      ws.send(`\r\n\x1b[31mFailed to start terminal: ${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n`);
      ws.close();
      return;
    }

    let outputBuffer = '';
    let flushTimeout: ReturnType<typeof setTimeout> | null = null;

    ptyProcess.onData((data) => {
      outputBuffer += data;
      if (!flushTimeout) {
        flushTimeout = setTimeout(() => {
          if (ws.readyState === ws.OPEN) ws.send(outputBuffer);
          outputBuffer = '';
          flushTimeout = null;
        }, 16);
      }
    });

    ptyProcess.onExit(() => {
      if (flushTimeout) { clearTimeout(flushTimeout); flushTimeout = null; }
      if (outputBuffer && ws.readyState === ws.OPEN) ws.send(outputBuffer);
      if (ws.readyState === ws.OPEN) ws.close();
      terminalService.kill(sessionId);
    });

    ws.on('message', (raw: RawData) => {
      const text = raw.toString();
      if (text.startsWith('{')) {
        try {
          const msg = JSON.parse(text) as { type?: string; cols?: number; rows?: number };
          if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
            terminalService.resize(sessionId, msg.cols, msg.rows);
            return;
          }
        } catch { /* not JSON — fall through */ }
      }
      terminalService.write(sessionId, text);
    });

    ws.on('close', () => {
      if (flushTimeout) { clearTimeout(flushTimeout); flushTimeout = null; }
      terminalService.kill(sessionId);
    });
    ws.on('error', () => {
      if (flushTimeout) { clearTimeout(flushTimeout); flushTimeout = null; }
      terminalService.kill(sessionId);
    });
  });
}

/**
 * Attaches two WebSocket servers to the Fastify HTTP server:
 *   /ws          — main chat + orchestrator channel (multi-session)
 *   /ws-terminal — PTY terminal sessions
 */
export function attachWebSocketServer(
  fastify: FastifyInstance,
  config: ConfigService,
  orchestrator: OrchestratorService,
  sessionRegistry: SessionRegistryService,
  playgroundWatcher: PlaygroundWatcherService,
  terminalService: TerminalService,
): WebSocketServer {
  const server = (fastify as { server: import('http').Server }).server;

  const wss = new WebSocketServer({ noServer: true });
  const terminalWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    if (pathname === '/ws-terminal') {
      terminalWss.handleUpgrade(req, socket, head, (ws) => terminalWss.emit('connection', ws, req));
    } else if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });

  attachChatWs(wss, config, orchestrator, sessionRegistry, playgroundWatcher);
  attachTerminalWs(terminalWss, config, terminalService);

  return wss;
}
