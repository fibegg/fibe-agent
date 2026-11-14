import { describe, test, expect } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConversationsController } from './conversations.controller';
import { ConversationManagerService } from './conversation-manager.service';
import { SessionRegistryService } from '../orchestrator/session-registry.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { ProviderTrafficStoreService } from '../provider-traffic/provider-traffic-store.service';
import { ConfigService } from '../config/config.service';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { LocalMcpService } from '../local-mcp/local-mcp.service';

describe('prompt answer HTTP contract', () => {
  test('requires bearer auth and returns exact stale_prompt conflicts', async () => {
    const password = randomUUID();
    const localMcp = new LocalMcpService();
    const module = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [AgentAuthGuard,
        { provide: ConfigService, useValue: { getAgentPassword: () => password } },
        { provide: ConversationManagerService, useValue: { get: () => ({}) } },
        { provide: SessionRegistryService, useValue: {} },
        { provide: ProviderTrafficStoreService, useValue: {} },
        { provide: OrchestratorService, useValue: { answerPrompt: (conversationId: string, promptId: string, payload: unknown) => {
          localMcp.resolveQuestion(promptId, payload, conversationId);
          return { accepted: true };
        } } },
      ],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    const waiting = localMcp.handleToolCall({ requestId: 'generated-fake', tool: 'confirm_action', args: { message: 'Proceed?' }, conversationId: 'thread-a' });
    const promptId = localMcp.pendingPrompts('thread-a')[0].promptId;
    const server = app.getHttpAdapter().getInstance();
    const send = (id: string, authorized = true) => server.inject({ method: 'POST', url: `/api/conversations/thread-a/prompts/${id}/answer`,
      ...(authorized ? { headers: { authorization: `Bearer ${password}` } } : {}), payload: { confirmed: true } });
    try {
      expect((await send(promptId, false)).statusCode).toBe(401);
      const unknown = await send('unknown');
      expect(unknown.statusCode).toBe(409);
      expect(unknown.json()).toEqual({ error: 'stale_prompt' });
      const accepted = await send(promptId);
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toEqual({ accepted: true });
      expect((await waiting).result).toEqual({ confirmed: true });
      const duplicate = await send(promptId);
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toEqual({ error: 'stale_prompt' });
    } finally {
      localMcp.onModuleDestroy();
      await waiting;
      await app.close();
    }
  });
});
