import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConversationsController } from './conversations.controller';
import { ConversationManagerService } from './conversation-manager.service';
import { SessionRegistryService } from '../orchestrator/session-registry.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { ProviderTrafficStoreService } from '../provider-traffic/provider-traffic-store.service';
import { ConfigService } from '../config/config.service';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { GlobalHttpExceptionFilter } from '../http-exception.filter';
import { enrichMessagesWithActivityUsage } from '../messages/enrich-messages-with-usage';
import type { StoredMessage } from '../message-store/message-store.service';
import type { StoredActivityEntry } from '../activity-store/activity-store.service';

const messages: StoredMessage[] = [
  { id: 'm1', role: 'user', body: 'one', created_at: '2026-11-15T10:00:00.000Z' },
  { id: 'm2', role: 'assistant', body: 'two', created_at: '2026-11-15T10:00:01.000Z', activityId: 'a2' },
  { id: 'm3', role: 'user', body: 'three', created_at: '2026-11-15T10:00:02.000Z' },
  { id: 'm4', role: 'assistant', body: 'four', created_at: '2026-11-15T10:00:03.000Z', activityId: 'a4' },
  { id: 'm5', role: 'user', body: 'five', created_at: '2026-11-15T10:00:04.000Z' },
];

const activities: StoredActivityEntry[] = [
  { id: 'a2', created_at: '2026-11-15T10:00:01.000Z', story: [], usage: { inputTokens: 2, outputTokens: 20 } },
  { id: 'a4', created_at: '2026-11-15T10:00:03.000Z', story: [], usage: { inputTokens: 4, outputTokens: 40 } },
];

describe('GET /api/conversations/:id/messages paging', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const bundle = {
      messageStore: { all: () => messages },
      activityStore: { all: () => activities },
    };
    const module = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        AgentAuthGuard,
        { provide: ConfigService, useValue: { getAgentPassword: () => undefined } },
        {
          provide: ConversationManagerService,
          useValue: { get: (id: string) => (id === 'thread-a' ? bundle : undefined) },
        },
        { provide: SessionRegistryService, useValue: {} },
        { provide: ProviderTrafficStoreService, useValue: {} },
        { provide: OrchestratorService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (query = '', id = 'thread-a') =>
    app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: `/api/conversations/${id}/messages${query}`,
    });
  const ids = (body: Array<{ id: string }>) => body.map((m) => m.id);

  test('without parameters returns the full enriched history and no paging header', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(
      JSON.parse(JSON.stringify(enrichMessagesWithActivityUsage(messages, activities))),
    );
    expect(res.headers['x-has-more']).toBeUndefined();
  });

  test('limit returns the newest messages oldest first', async () => {
    const res = await get('?limit=2');
    expect(res.statusCode).toBe(200);
    expect(ids(res.json())).toEqual(['m4', 'm5']);
    expect(res.headers['x-has-more']).toBe('true');
  });

  test('limit covering the history reports no older messages', async () => {
    const res = await get('?limit=500');
    expect(ids(res.json())).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(res.headers['x-has-more']).toBe('false');
  });

  test('before with limit returns the messages immediately before that message', async () => {
    const res = await get('?before=m4&limit=2');
    expect(res.statusCode).toBe(200);
    expect(ids(res.json())).toEqual(['m2', 'm3']);
    expect(res.headers['x-has-more']).toBe('true');

    const oldest = await get('?before=m3&limit=5');
    expect(ids(oldest.json())).toEqual(['m1', 'm2']);
    expect(oldest.headers['x-has-more']).toBe('false');

    const none = await get('?before=m1&limit=5');
    expect(none.json()).toEqual([]);
    expect(none.headers['x-has-more']).toBe('false');
  });

  test('enriches only the returned slice with activity usage', async () => {
    const res = await get('?limit=2');
    const body = res.json() as Array<StoredMessage & { usage?: unknown }>;
    expect(body).toEqual([
      { ...messages[3], usage: { inputTokens: 4, outputTokens: 40 } },
      messages[4],
    ]);

    const earlier = await get('?before=m3&limit=1');
    expect(earlier.json()).toEqual([
      { ...messages[1], usage: { inputTokens: 2, outputTokens: 20 } },
    ]);
  });

  test('unknown before id returns 404', async () => {
    const res = await get('?before=missing&limit=2');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      statusCode: 404,
      message: 'Message not found',
      error: 'NotFoundException',
    });
  });

  test.each(['0', '501', '2.5', 'abc', '-1', '', '1&limit=2'])(
    'invalid limit %p returns 400',
    async (limit) => {
      const res = await get(`?limit=${limit}`);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ statusCode: 400 });
      expect(res.headers['x-has-more']).toBeUndefined();
    },
  );

  test('unknown conversation still returns 404', async () => {
    const res = await get('?limit=2', 'missing-thread');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ message: 'Conversation not found' });
  });
});
