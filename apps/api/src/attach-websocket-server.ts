import type { FastifyInstance } from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import { randomUUID } from 'node:crypto';
import { ConfigService } from './app/config/config.service';
import { OrchestratorService } from './app/orchestrator/orchestrator.service';
import { PlaygroundWatcherService } from './app/playgrounds/playground-watcher.service';
import { TerminalService } from './app/terminal/terminal.service';
import { WS_CLOSE, WS_EVENT } from '@shared/ws-constants';
import { logWs } from './container-logger';

type ClientMessage = {
  action: string;
  code?: string;
  text?: string;
  model?: string;
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

function attachChatWs(
  wss: WebSocketServer,
  config: ConfigService,
  orchestrator: OrchestratorService,
  playgroundWatcher: PlaygroundWatcherService,
): void {
  let activeClient: WebSocket | null = null;

  const sendToClient = (type: string, data: Record<string, unknown> = {}): void => {
    if (activeClient?.readyState === WebSocket.OPEN) {
      activeClient.send(JSON.stringify({ type, ...data }));
    }
  };

  orchestrator.outbound.subscribe((ev) => sendToClient(ev.type, ev.data as Record<string, unknown>));
  playgroundWatcher.playgroundChanged$.subscribe(() => sendToClient(WS_EVENT.PLAYGROUND_CHANGED, {}));

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    if (rejectIfUnauthorized(ws, req, config.getAgentPassword())) return;

    // Take over the session from any previous client.
    if (activeClient?.readyState === WebSocket.OPEN) {
      activeClient.close(WS_CLOSE.SESSION_TAKEN_OVER, 'Session taken over by another client');
    }
    activeClient = ws;
    orchestrator.handleClientConnected();
    logWs({ event: 'connect' });

    ws.on('message', (raw: RawData) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        logWs({ event: 'action', action: msg.action });
        void orchestrator.handleClientMessage(msg);
      } catch {
        // ignore invalid JSON
      }
    });

    ws.on('close', (code?: number) => {
      logWs({ event: 'disconnect', closeCode: code });
      if (activeClient === ws) activeClient = null;
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

    ptyProcess.onData((data) => { if (ws.readyState === ws.OPEN) ws.send(data); });
    ptyProcess.onExit(() => {
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

    ws.on('close', () => terminalService.kill(sessionId));
    ws.on('error', () => terminalService.kill(sessionId));
  });
}

/**
 * Attaches two WebSocket servers to the Fastify HTTP server:
 *   /ws          — main chat + orchestrator channel
 *   /ws-terminal — PTY terminal sessions
 *
 * Both use `noServer: true` so they share a single manual `upgrade` dispatcher.
 * This avoids the "two upgrade listeners competing for the same socket" bug that
 * causes immediate code-1006 disconnections when two `WebSocketServer` instances
 * are bound to the same `http.Server`.
 */
export function attachWebSocketServer(
  fastify: FastifyInstance,
  config: ConfigService,
  orchestrator: OrchestratorService,
  playgroundWatcher: PlaygroundWatcherService,
  terminalService: TerminalService,
): WebSocketServer {
  const server = (fastify as { server: import('http').Server }).server;

  const wss = new WebSocketServer({ noServer: true });
  const terminalWss = new WebSocketServer({ noServer: true });

  // Single upgrade dispatcher — routes by exact pathname so both servers
  // get exactly the sockets they own; no cross-destruction.
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

  attachChatWs(wss, config, orchestrator, playgroundWatcher);
  attachTerminalWs(terminalWss, config, terminalService);

  return wss;
}
