import type { FastifyInstance } from 'fastify';
import { WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import { ConfigService } from './app/config/config.service';
import { OrchestratorService } from './app/orchestrator/orchestrator.service';
import { PlaygroundWatcherService } from './app/playgrounds/playground-watcher.service';
import { WS_CLOSE, WS_EVENT } from './app/ws.constants';
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

export function attachWebSocketServer(
  fastify: FastifyInstance,
  config: ConfigService,
  orchestrator: OrchestratorService,
  playgroundWatcher: PlaygroundWatcherService
): WebSocketServer {
  const server = (fastify as { server: import('http').Server }).server;
  const wss = new WebSocketServer({ server, path: '/ws' });

  let activeClient: import('ws').WebSocket | null = null;

  const sendToClient = (type: string, data: Record<string, unknown> = {}) => {
    if (activeClient && activeClient.readyState === 1) {
      activeClient.send(JSON.stringify({ type, ...data }));
    }
  };

  orchestrator.outbound.subscribe((ev) => {
    sendToClient(ev.type, ev.data as Record<string, unknown>);
  });

  playgroundWatcher.playgroundChanged$.subscribe(() => {
    sendToClient(WS_EVENT.PLAYGROUND_CHANGED, {});
  });

  wss.on('connection', (ws, req) => {
    const requiredPassword = config.getAgentPassword();
    if (requiredPassword) {
      const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
      const token = url.searchParams.get('token');
      if (token !== requiredPassword) {
        logWs({ event: 'disconnect', closeCode: WS_CLOSE.UNAUTHORIZED, error: 'Unauthorized' });
        ws.close(WS_CLOSE.UNAUTHORIZED, 'Unauthorized');
        return;
      }
    }
    if (activeClient && activeClient.readyState === 1) {
      activeClient.close(WS_CLOSE.SESSION_TAKEN_OVER, 'Session taken over by another client');
      activeClient = null;
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
      if (activeClient === ws) {
        activeClient = null;
      }
    });

    ws.on('error', (err) => {
      logWs({ event: 'disconnect', error: err instanceof Error ? err.message : String(err) });
    });
  });

  return wss;
}
