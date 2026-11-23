import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { HTTPMethods } from 'fastify';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ConfigService } from '../config/config.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { SessionRegistryService } from '../orchestrator/session-registry.service';
import { ProviderTrafficStoreService } from '../provider-traffic/provider-traffic-store.service';
import { ConversationManagerService } from './conversation-manager.service';
import { ConversationsController } from './conversations.controller';

const password = 'fixture-agent-password';
const basePath = '/api/conversations';
const conversation = { id: 'thread-a', title: 'Fixture conversation' };
const listResponse = [{ ...conversation, isProcessing: false }];

async function createApp(agentPassword?: string): Promise<NestFastifyApplication> {
  const module = await Test.createTestingModule({
    controllers: [ConversationsController],
    providers: [
      AgentAuthGuard,
      { provide: ConfigService, useValue: { getAgentPassword: () => agentPassword } },
      {
        provide: ConversationManagerService,
        useValue: {
          list: () => [conversation],
          create: (title?: string) => ({ ...conversation, title }),
        },
      },
      { provide: SessionRegistryService, useValue: { isConversationProcessing: () => false } },
      { provide: OrchestratorService, useValue: {} },
      { provide: ProviderTrafficStoreService, useValue: {} },
    ],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('api');
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('conversation route authentication', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp(password);
  });

  afterAll(async () => {
    await app.close();
  });

  test.each([
    ['GET', basePath],
    ['POST', basePath],
    ['PATCH', `${basePath}/thread-a/title`],
    ['PATCH', `${basePath}/thread-a`],
    ['DELETE', `${basePath}/thread-a`],
    ['GET', `${basePath}/thread-a/messages`],
    ['GET', `${basePath}/thread-a/activities`],
    ['GET', `${basePath}/thread-a/live`],
    ['GET', `${basePath}/thread-a/provider-traffic`],
    ['POST', `${basePath}/thread-a/agent/send-message`],
    ['POST', `${basePath}/thread-a/agent/interrupt`],
    ['DELETE', `${basePath}/thread-a/queue/turn-a`],
    ['PATCH', `${basePath}/thread-a/queue/turn-a`],
    ['POST', `${basePath}/thread-a/queue/reorder`],
  ] satisfies [HTTPMethods, string][])(
    '%s %s rejects missing and wrong credentials',
    async (method, url) => {
      const server = app.getHttpAdapter().getInstance();
      const missing = await server.inject({ method, url });
      const wrong = await server.inject({
        method,
        url,
        headers: { authorization: 'Bearer wrong-password' },
      });
      expect(missing.statusCode).toBe(401);
      expect(wrong.statusCode).toBe(401);
    },
  );

  test('lists and creates conversations with the runtime Bearer token', async () => {
    const server = app.getHttpAdapter().getInstance();
    const headers = { authorization: `Bearer ${password}` };
    const list = await server.inject({ method: 'GET', url: basePath, headers });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual(listResponse);

    const create = await server.inject({
      method: 'POST',
      url: basePath,
      headers,
      payload: { title: 'New conversation' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json()).toEqual({ ...conversation, title: 'New conversation' });
  });

  test('allows passwordless Agents to serve conversation requests without a token', async () => {
    const passwordlessApp = await createApp();
    try {
      const list = await passwordlessApp.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: basePath,
      });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toEqual(listResponse);
    } finally {
      await passwordlessApp.close();
    }
  });
});
