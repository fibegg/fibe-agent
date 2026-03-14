import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { AppModule } from './app/app.module';
import { ConfigService } from './app/config/config.service';
import { getCorsOrigin, getFrameAncestors } from './cors-frame.config';
import { GlobalHttpExceptionFilter } from './app/http-exception.filter';
import { OrchestratorService } from './app/orchestrator/orchestrator.service';
import { loadInjectedCredentials } from './credential-injector';

const MULTIPART_LIMIT_BYTES = 20 * 1024 * 1024;
const DEFAULT_PORT = 3000;

// Ensure playground directory exists before anything tries to use it
const playgroundsDir = process.env.PLAYGROUNDS_DIR ?? join(process.cwd(), 'playground');
try { mkdirSync(playgroundsDir, { recursive: true }); } catch { /* ignore if it fails */ }

async function bootstrap() {
  const injected = loadInjectedCredentials();
  if (injected) {
    Logger.log('Stored agent credentials loaded — skipping manual auth.');
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  const fastify = app.getHttpAdapter().getInstance();

  const ancestors = getFrameAncestors(process.env);
  const isHttp = ancestors.some((a) => a.startsWith('http://'));

  await fastify.register(helmet, {
    frameguard: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        frameAncestors: ancestors,
        scriptSrc: ["'self'", "'unsafe-inline'"],
        ...(isHttp ? { upgradeInsecureRequests: null } : {}),
      },
    },
  });
  await fastify.register(multipart, { limits: { fileSize: MULTIPART_LIMIT_BYTES } });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: getCorsOrigin(process.env),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true })
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  await app.listen(port, '0.0.0.0');
  Logger.log(`Application is running on: http://localhost:${port}/api`);

  const config = app.get(ConfigService);
  const orchestrator = app.get(OrchestratorService);
  if (injected) {
    orchestrator.isAuthenticated = true;
  }
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

  wss.on('connection', (ws, req) => {
    const requiredPassword = config.getAgentPassword();
    if (requiredPassword) {
      const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
      const token = url.searchParams.get('token');
      if (token !== requiredPassword) {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }
    if (activeClient && activeClient.readyState === 1) {
      ws.close(4000, 'Another session is already active');
      return;
    }
    activeClient = ws;
    orchestrator.handleClientConnected();

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          action: string;
          code?: string;
          text?: string;
          model?: string;
          images?: string[];
          audio?: string;
          audioFilename?: string;
        };
        void orchestrator.handleClientMessage(msg);
      } catch {
        // ignore invalid JSON
      }
    });

    ws.on('close', () => {
      if (activeClient === ws) {
        activeClient = null;
      }
    });

    ws.on('error', () => {
      /* ignore */
    });
  });

  Logger.log(`WebSocket server listening on path /ws`);
}

bootstrap();
