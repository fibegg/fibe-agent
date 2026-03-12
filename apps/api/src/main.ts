import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { WebSocketServer } from 'ws';
import { AppModule } from './app/app.module';
import { ConfigService } from './app/config/config.service';
import { GlobalHttpExceptionFilter } from './app/http-exception.filter';
import { OrchestratorService } from './app/orchestrator/orchestrator.service';
import { loadInjectedCredentials } from './credential-injector';

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
  await fastify.register(helmet);
  await fastify.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : ['http://localhost:3100', 'http://localhost:4300'];
  app.enableCors({ origin: corsOrigins });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true })
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `Application is running on: http://localhost:${port}/${globalPrefix}`
  );

  const config = app.get(ConfigService);
  const orchestrator = app.get(OrchestratorService);
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
