import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadDevEnv } from './load-env';
import { AppModule } from './app/app.module';
import { ConfigService } from './app/config/config.service';
import { getCorsOrigin, getFrameAncestors } from './cors-frame.config';
import { GlobalHttpExceptionFilter } from './app/http-exception.filter';
import { OrchestratorService } from './app/orchestrator/orchestrator.service';
import { PlaygroundWatcherService } from './app/playgrounds/playground-watcher.service';
import { attachWebSocketServer } from './attach-websocket-server';
import { ContainerLoggerService, logRequest } from './container-logger';
import { loadInjectedCredentials } from './credential-injector';
import { runPostInitOnce } from './post-init-runner';
import { TerminalService } from './app/terminal/terminal.service';

// Must be called before any service reads process.env
loadDevEnv();

const MULTIPART_LIMIT_BYTES = 20 * 1024 * 1024;
const DEFAULT_PORT = 3000;

// Ensure playground directory exists before anything tries to use it
const playgroundsDir = process.env.PLAYGROUNDS_DIR ?? join(process.cwd(), 'playground');
try { mkdirSync(playgroundsDir, { recursive: true }); } catch { /* ignore if it fails */ }

async function bootstrap() {
  const logger = new ContainerLoggerService('Bootstrap');
  const injected = loadInjectedCredentials();
  if (injected) {
    logger.log('Stored agent credentials loaded — skipping manual auth.');
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger }
  );
  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook('onRequest', (request, _reply, done) => {
    (request as { _startTime?: number })._startTime = Date.now();
    (request as { _requestId?: string })._requestId =
      (request.headers['x-request-id'] as string) ?? randomUUID();
    done();
  });
  fastify.addHook('onResponse', (request, reply, done) => {
    const start = (request as { _startTime?: number })._startTime;
    const requestId = (request as { _requestId?: string })._requestId ?? '';
    logRequest({
      requestId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: start != null ? Date.now() - start : 0,
    });
    done();
  });

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

  // Enable graceful shutdown so OnModuleDestroy (which kills node-pty) is triggered
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || DEFAULT_PORT;
  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on: http://localhost:${port}/api`);

  const config = app.get(ConfigService);
  const orchestrator = app.get(OrchestratorService);
  if (injected) {
    orchestrator.isAuthenticated = true;
    orchestrator.ensureStrategySettings();
  }
  const playgroundWatcher = app.get(PlaygroundWatcherService);
  const terminalService = app.get(TerminalService);
  attachWebSocketServer(fastify, config, orchestrator, playgroundWatcher, terminalService);
  logger.log('WebSocket server listening on paths /ws and /ws-terminal');

  const postInitScript = config.getPostInitScript();
  if (postInitScript) {
    void runPostInitOnce(
      config.getConversationDataDir(),
      postInitScript,
      config.getPlaygroundsDir()
    );
  }
}

bootstrap();
