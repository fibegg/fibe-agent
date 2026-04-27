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
  const activeClients = new Set<WebSocket>();

  const broadcastToClients = (type: string, data: Record<string, unknown> = {}): void => {
    const payload = JSON.stringify({ type, ...data });
    for (const client of activeClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  };

  orchestrator.outbound.subscribe((ev) => broadcastToClients(ev.type, ev.data as Record<string, unknown>));
  playgroundWatcher.playgroundChanged$.subscribe(() => broadcastToClients(WS_EVENT.PLAYGROUND_CHANGED, {}));

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    if (rejectIfUnauthorized(ws, req, config.getAgentPassword())) return;

    // Limit to 5 concurrent connections by dropping the oldest
    if (activeClients.size >= 5) {
      const oldestClient = activeClients.values().next().value;
      if (oldestClient) {
        oldestClient.close(WS_CLOSE.SESSION_TAKEN_OVER, 'Maximum number of connections reached (5). Oldest session closed.');
        activeClients.delete(oldestClient);
      }
    }

    activeClients.add(ws);
    orchestrator.handleClientConnected();
    logWs({ event: 'connect' });

    let messageCount = 0;
    const MESSAGE_LIMIT = 60;
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
        void orchestrator.handleClientMessage(msg);
      } catch {
        // ignore invalid JSON
      }
    });

    ws.on('close', (code?: number) => {
      clearInterval(resetInterval);
      activeClients.delete(ws);
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
