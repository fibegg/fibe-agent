import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  jest,
  spyOn,
} from 'bun:test';
import { Logger } from '@nestjs/common';
import { FibeSyncService } from './fibe-sync.service';
import { SYNC_BODY_BUDGET_BYTES } from './fibe-sync-batches';

/**
 * Advances the service's debounce/retry timers deterministically. Each step
 * lets the mocked fetch and response promises settle before time moves on, so
 * a slow host cannot make a timer fire after the assertion.
 */
async function elapse(ms: number, stepMs = 50): Promise<void> {
  for (let passed = 0; passed < ms; passed += stepMs) {
    jest.advanceTimersByTime(Math.min(stepMs, ms - passed));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }
}

type FetchMock = { mock: { calls: unknown[][] } };

function sentBodies(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls.map(
    (call) => (call[1] as RequestInit).body as string,
  );
}

function sentItems(body: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(body) as { content: string };
  return JSON.parse(parsed.content) as Array<Record<string, unknown>>;
}

function sentIds(body: string): string[] {
  return sentItems(body).map((item) => item.id as string);
}

describe('FibeSyncService', () => {
  const envBackup: Record<string, string | undefined> = {};

  const mockConfig = {
    isFibeSyncEnabled: () => false,
    getFibeApiUrl: () => undefined as string | undefined,
    getFibeApiKey: () => undefined as string | undefined,
    getFibeAgentId: () => undefined as string | undefined,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    envBackup.FIBE_SYNC_ENABLED = process.env.FIBE_SYNC_ENABLED;
    mockConfig.isFibeSyncEnabled = () => false;
    mockConfig.getFibeApiUrl = () => undefined;
    mockConfig.getFibeApiKey = () => undefined;
    mockConfig.getFibeAgentId = () => undefined;
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.FIBE_SYNC_ENABLED = envBackup.FIBE_SYNC_ENABLED;
  });

  test('syncMessages does nothing when sync is disabled', async () => {
    const service = new FibeSyncService(mockConfig as never);
    service.syncMessages(() => '{"messages":[]}');
  });

  test('syncActivity does nothing when sync is disabled', async () => {
    const service = new FibeSyncService(mockConfig as never);
    service.syncActivity(() => '[]');
  });

  test('sync does nothing when apiUrl/apiKey/agentId are missing', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    const service = new FibeSyncService(mockConfig as never);
    service.syncMessages(() => '{}');
  });

  test('syncMessages makes PUT request when fully configured', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('', { status: 200 }),
    ) as unknown as typeof fetch;

    try {
      const service = new FibeSyncService(mockConfig as never);
      service.syncMessages(() => '{"data":"test"}');
      await elapse(600);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/agent-1/messages',
        {
          method: 'PUT',
          signal: expect.any(AbortSignal),
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer key123',
          },
          body: JSON.stringify({
            content: '{"data":"test"}',
            conversation_id: 'default',
          }),
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('syncActivity makes PUT request with activity endpoint', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('', { status: 200 }),
    ) as unknown as typeof fetch;

    try {
      const service = new FibeSyncService(mockConfig as never);
      service.syncActivity(() => '[]');
      await elapse(600);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/agent-1/activity',
        expect.objectContaining({ method: 'PUT' }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('syncRawProviders makes PUT request with provider_traffic endpoint', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('', { status: 200 }),
    ) as unknown as typeof fetch;

    try {
      const service = new FibeSyncService(mockConfig as never);
      service.syncRawProviders(() => '[{"id":"raw-1"}]');
      await elapse(600);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/agent-1/provider_traffic',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            content: '[{"id":"raw-1"}]',
            conversation_id: 'default',
          }),
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('syncMessages keeps separate pending syncs per conversation', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('', { status: 200 }),
    ) as unknown as typeof fetch;

    const service = new FibeSyncService(mockConfig as never);
    try {
      service.syncMessages(() => '{"conversation":"a"}', 'conv-a');
      service.syncMessages(() => '{"conversation":"b"}', 'conv-b');
      await elapse(600);

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/agent-1/messages',
        expect.objectContaining({
          body: JSON.stringify({
            content: '{"conversation":"a"}',
            conversation_id: 'conv-a',
          }),
        }),
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/agent-1/messages',
        expect.objectContaining({
          body: JSON.stringify({
            content: '{"conversation":"b"}',
            conversation_id: 'conv-b',
          }),
        }),
      );
    } finally {
      service.onModuleDestroy();
      globalThis.fetch = originalFetch;
    }
  });

  test('retries failed sync with latest content for the conversation', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    let attempts = 0;
    let content = '{"attempt":"first"}';
    globalThis.fetch = mock(async () => {
      attempts += 1;
      return new Response('', { status: attempts === 1 ? 500 : 200 });
    }) as unknown as typeof fetch;

    const service = new FibeSyncService(mockConfig as never);
    try {
      service.syncMessages(() => content, 'conv-retry');
      await elapse(600);
      content = '{"attempt":"second"}';
      await elapse(1200);

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        'https://fibe.test/api/agents/agent-1/messages',
        expect.objectContaining({
          body: JSON.stringify({
            content: '{"attempt":"second"}',
            conversation_id: 'conv-retry',
          }),
        }),
      );
    } finally {
      service.onModuleDestroy();
      globalThis.fetch = originalFetch;
    }
  });

  test('treats authorization failures as terminal instead of retrying forever', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('Unauthorized', { status: 401 }),
    ) as unknown as typeof fetch;

    const service = new FibeSyncService(mockConfig as never);
    try {
      service.syncMessages(() => '{"kept":true}', 'conv-auth');
      await elapse(1800);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        'https://fibe.test/api/agents/agent-1/messages',
        expect.objectContaining({
          body: JSON.stringify({
            content: '{"kept":true}',
            conversation_id: 'conv-auth',
          }),
        }),
      );
    } finally {
      service.onModuleDestroy();
      globalThis.fetch = originalFetch;
    }
  });

  test('handles non-ok response without throwing', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('Server Error', { status: 500 }),
    ) as unknown as typeof fetch;

    const service = new FibeSyncService(mockConfig as never);
    try {
      service.syncMessages(() => '{}');
      await elapse(600);
    } finally {
      service.onModuleDestroy();
      globalThis.fetch = originalFetch;
    }
  });

  test('handles network error without throwing', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const service = new FibeSyncService(mockConfig as never);
    try {
      service.syncMessages(() => '{}');
      await elapse(600);
    } finally {
      service.onModuleDestroy();
      globalThis.fetch = originalFetch;
    }
  });
  describe('batched delta sync', () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
      mockConfig.isFibeSyncEnabled = () => true;
      mockConfig.getFibeApiUrl = () => 'https://fibe.test';
      mockConfig.getFibeApiKey = () => 'key123';
      mockConfig.getFibeAgentId = () => 'agent-1';
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    function okFetch() {
      const fetchMock = mock(
        async (_url: string, _init: RequestInit) =>
          new Response('{"status":"ok"}', { status: 200 }),
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    test('splits a large array into bodies within budget that together carry every item', async () => {
      const fetchMock = okFetch();
      const items = Array.from({ length: 60 }, (_, i) => ({
        id: `msg-${i}`,
        role: 'assistant',
        created_at: '2026-11-16T00:00:00.000Z',
        body: `"quoted" \\ back é 😀 ${i} `.repeat(2_000),
      }));
      const service = new FibeSyncService(mockConfig as never);
      try {
        service.syncMessages(() => JSON.stringify(items), 'conv-big');
        await elapse(600);

        const bodies = sentBodies(fetchMock);
        expect(bodies.length).toBeGreaterThan(1);
        for (const body of bodies) {
          expect(Buffer.byteLength(body)).toBeLessThanOrEqual(
            SYNC_BODY_BUDGET_BYTES,
          );
          expect(Object.keys(JSON.parse(body))).toEqual([
            'content',
            'conversation_id',
          ]);
          expect(JSON.parse(body).conversation_id).toBe('conv-big');
        }
        expect(bodies.flatMap(sentItems)).toEqual(items);
      } finally {
        service.onModuleDestroy();
      }
    });

    test('sends an item bigger than the budget alone, byte-identical, after the other batches', async () => {
      const fetchMock = okFetch();
      const first = { id: 'act-1', created_at: '2026-11-16T00:00:00.000Z' };
      const huge = {
        id: 'act-huge',
        created_at: '2026-11-16T00:00:01.000Z',
        story: [
          {
            id: 'step-1',
            type: 'tool_call',
            details: 'x"\\é😀'.repeat(200_000),
          },
        ],
      };
      const last = { id: 'act-2', created_at: '2026-11-16T00:00:02.000Z' };
      const content = JSON.stringify([first, huge, last]);
      const service = new FibeSyncService(mockConfig as never);
      try {
        service.syncActivity(() => content, 'conv-huge');
        await elapse(600);

        const bodies = sentBodies(fetchMock);
        expect(bodies).toHaveLength(2);
        expect(sentItems(bodies[0])).toEqual([first, last]);
        expect(Buffer.byteLength(bodies[0])).toBeLessThanOrEqual(
          SYNC_BODY_BUDGET_BYTES,
        );
        expect(Buffer.byteLength(bodies[1])).toBeGreaterThan(1024 * 1024);
        expect(JSON.parse(bodies[1]).content).toBe(`[${JSON.stringify(huge)}]`);
        expect(JSON.parse(bodies[1]).conversation_id).toBe('conv-huge');
      } finally {
        service.onModuleDestroy();
      }
    });

    test('paces the next flush by the bytes the last one sent and still delivers the newest version', async () => {
      const fetchMock = okFetch();
      const output = 'x'.repeat(3 * 1024 * 1024);
      let version = 1;
      const content = () =>
        JSON.stringify([{ id: 'act-running', step: version, output }]);
      const sentSteps = () =>
        sentBodies(fetchMock).map((body) => sentItems(body)[0].step);
      const service = new FibeSyncService(mockConfig as never);
      try {
        service.syncActivity(content, 'conv-pace');
        await elapse(600);
        expect(sentSteps()).toEqual([1]);

        // ~3 MiB sent at t=500 ms: the next flush waits ~6 s, however often
        // the running turn changes meanwhile.
        for (let i = 0; i < 25; i++) {
          version += 1;
          service.syncActivity(content, 'conv-pace');
          await elapse(200);
        }
        await elapse(800);
        expect(sentSteps()).toEqual([1]);
        await elapse(200);
        expect(sentSteps()).toEqual([1, 26]);

        version += 1;
        service.syncActivity(content, 'conv-pace');
        await elapse(5_800);
        expect(sentSteps()).toEqual([1, 26]);
        await elapse(200);
        expect(sentSteps()).toEqual([1, 26, 27]);

        await elapse(60_000, 500);
        expect(fetchMock).toHaveBeenCalledTimes(3);
      } finally {
        service.onModuleDestroy();
      }
    });

    test('an oversized item an older Fibe API refuses is retried when it changes and every 10 minutes', async () => {
      let upgraded = false;
      const callTimes: number[] = [];
      const fetchMock = mock(async (_url: string, init: RequestInit) => {
        callTimes.push(Date.now());
        const overLimit = Buffer.byteLength(init.body as string) > 1024 * 1024;
        return overLimit && !upgraded
          ? new Response('{"error":{"code":"VALIDATION_FAILED"}}', {
              status: 422,
              statusText: 'Unprocessable Entity',
            })
          : new Response('{"status":"ok"}', { status: 200 });
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const warn = spyOn(Logger.prototype, 'warn');
      const small = { id: 'msg-small', role: 'user', body: 'hi' };
      let huge = {
        id: 'msg-huge',
        role: 'assistant',
        body: 'y'.repeat(1_500_000),
      };
      const content = () => JSON.stringify([small, huge]);
      const service = new FibeSyncService(mockConfig as never);
      try {
        service.syncMessages(content, 'conv-old-api');
        await elapse(600);
        expect(sentBodies(fetchMock).map(sentIds)).toEqual([
          ['msg-small'],
          ['msg-huge'],
        ]);
        const oversized = warn.mock.calls
          .map((call) => String(call[0]))
          .filter((message) => message.includes('msg-huge'));
        expect(oversized).toHaveLength(1);
        expect(oversized[0]).toContain(
          `${Buffer.byteLength(sentBodies(fetchMock)[1])} bytes`,
        );
        expect(oversized[0]).toContain('upgrade the Fibe API');

        // No backoff loop re-uploading megabytes.
        await elapse(120_000, 1_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        // A change is offered again right away (after pacing).
        huge = { ...huge, body: 'z'.repeat(1_500_000) };
        service.syncMessages(content, 'conv-old-api');
        await elapse(5_000, 100);
        expect(sentBodies(fetchMock).map(sentIds)).toEqual([
          ['msg-small'],
          ['msg-huge'],
          ['msg-huge'],
        ]);
        const refusedAt = callTimes[2];

        // Once the API accepts larger bodies, the unchanged item lands at the
        // next 10-minute retry without a local change or an Agent restart.
        upgraded = true;
        await elapse(refusedAt + 600_000 - Date.now() - 1_000, 1_000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        await elapse(2_000, 100);
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(JSON.parse(sentBodies(fetchMock)[3]).content).toBe(
          `[${JSON.stringify(huge)}]`,
        );

        await elapse(1_300_000, 5_000);
        expect(fetchMock).toHaveBeenCalledTimes(4);
      } finally {
        warn.mockRestore();
        service.onModuleDestroy();
      }
    });

    test('a later sync sends only new or changed items; a restart sends everything', async () => {
      const fetchMock = okFetch();
      let items: Array<Record<string, unknown>> = [
        { id: 'a', role: 'user', body: 'one' },
        { id: 'b', role: 'assistant', body: 'two' },
        { id: 'c', role: 'user', body: 'three' },
      ];
      const service = new FibeSyncService(mockConfig as never);
      const restarted = new FibeSyncService(mockConfig as never);
      try {
        service.syncMessages(() => JSON.stringify(items), 'conv-delta');
        await elapse(600);
        expect(sentIds(sentBodies(fetchMock)[0])).toEqual(['a', 'b', 'c']);

        items = [
          { id: 'a', role: 'user', body: 'one' },
          { id: 'b', role: 'assistant', body: 'two, edited' },
          { id: 'c', role: 'user', body: 'three' },
          { id: 'd', role: 'user', body: 'four' },
        ];
        service.syncMessages(() => JSON.stringify(items), 'conv-delta');
        await elapse(600);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(sentItems(sentBodies(fetchMock)[1])).toEqual([
          items[1],
          items[3],
        ]);

        // Another conversation keeps its own acknowledgements.
        service.syncMessages(() => JSON.stringify(items), 'conv-other');
        await elapse(600);
        expect(sentIds(sentBodies(fetchMock)[2])).toEqual(['a', 'b', 'c', 'd']);

        restarted.syncMessages(() => JSON.stringify(items), 'conv-delta');
        await elapse(600);
        expect(sentIds(sentBodies(fetchMock)[3])).toEqual(['a', 'b', 'c', 'd']);
      } finally {
        service.onModuleDestroy();
        restarted.onModuleDestroy();
      }
    });

    test('a 422 for an in-budget batch is logged once and not retried until the item changes', async () => {
      const fetchMock = mock(
        async (_url: string, _init: RequestInit) =>
          new Response('{"error":{"code":"VALIDATION_FAILED"}}', {
            status: 422,
            statusText: 'Unprocessable Entity',
          }),
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const warn = spyOn(Logger.prototype, 'warn');
      let items = [
        { id: 'a', body: 'one' },
        { id: 'b', body: 'two' },
      ];
      const service = new FibeSyncService(mockConfig as never);
      try {
        service.syncActivity(() => JSON.stringify(items), 'conv-refused');
        await elapse(120_000, 500);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const refusals = warn.mock.calls.filter((call) =>
          String(call[0]).includes('422'),
        );
        expect(refusals).toHaveLength(1);
        expect(String(refusals[0][0])).toContain('2 item(s)');
        expect(String(refusals[0][0])).toContain(
          `${Buffer.byteLength(sentBodies(fetchMock)[0])} bytes`,
        );

        items = [
          { id: 'a', body: 'one' },
          { id: 'b', body: 'two, edited' },
        ];
        service.syncActivity(() => JSON.stringify(items), 'conv-refused');
        await elapse(120_000, 500);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(sentIds(sentBodies(fetchMock)[1])).toEqual(['b']);

        // In-budget refusals are not offered again periodically.
        await elapse(1_300_000, 5_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        warn.mockRestore();
        service.onModuleDestroy();
      }
    });

    test('a 502 is retried from the failed batch without resending acknowledged batches', async () => {
      let attempts = 0;
      const fetchMock = mock(async (_url: string, _init: RequestInit) => {
        attempts += 1;
        return attempts === 2
          ? new Response('Bad Gateway', {
              status: 502,
              statusText: 'Bad Gateway',
            })
          : new Response('{"status":"ok"}', { status: 200 });
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      // Each item needs a batch of its own.
      const items = ['a', 'b', 'c'].map((id) => ({
        id,
        body: id.repeat(500_000),
      }));
      const service = new FibeSyncService(mockConfig as never);
      try {
        service.syncMessages(() => JSON.stringify(items), 'conv-502');
        await elapse(600);
        expect(sentBodies(fetchMock).map(sentIds)).toEqual([['a'], ['b']]);

        // ~1 MB was sent, so pacing (~1.9 s) outlasts the 1 s backoff.
        await elapse(1_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await elapse(1_000);
        expect(sentBodies(fetchMock).map(sentIds)).toEqual([
          ['a'],
          ['b'],
          ['b'],
          ['c'],
        ]);

        await elapse(60_000, 500);
        expect(fetchMock).toHaveBeenCalledTimes(4);
      } finally {
        service.onModuleDestroy();
      }
    });

    test('authorization failure stops the remaining batches without retrying', async () => {
      const fetchMock = mock(
        async (_url: string, _init: RequestInit) =>
          new Response('Unauthorized', { status: 401 }),
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const items = ['a', 'b', 'c'].map((id) => ({
        id,
        body: id.repeat(500_000),
      }));
      const service = new FibeSyncService(mockConfig as never);
      try {
        service.syncMessages(() => JSON.stringify(items), 'conv-auth-batches');
        await elapse(60_000, 500);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        service.onModuleDestroy();
      }
    });
  });
});
