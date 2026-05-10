import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { FibeSyncService } from './fibe-sync.service';

describe('FibeSyncService', () => {
  const envBackup: Record<string, string | undefined> = {};

  const mockConfig = {
    isFibeSyncEnabled: () => false,
    getFibeApiUrl: () => undefined as string | undefined,
    getFibeApiKey: () => undefined as string | undefined,
    getFibeAgentId: () => undefined as string | undefined,
  };

  beforeEach(() => {
    envBackup.FIBE_SYNC_ENABLED = process.env.FIBE_SYNC_ENABLED;
    mockConfig.isFibeSyncEnabled = () => false;
    mockConfig.getFibeApiUrl = () => undefined;
    mockConfig.getFibeApiKey = () => undefined;
    mockConfig.getFibeAgentId = () => undefined;
  });

  afterEach(() => {
    process.env.FIBE_SYNC_ENABLED = envBackup.FIBE_SYNC_ENABLED;
  });

  test('syncMessages does nothing when sync is disabled', async () => {
    const service = new FibeSyncService(mockConfig as never);
    // Should not throw
    service.syncMessages(() => '{"messages":[]}');
  });

  test('syncActivity does nothing when sync is disabled', async () => {
    const service = new FibeSyncService(mockConfig as never);
    service.syncActivity(() => '[]');
  });

  test('sync does nothing when apiUrl/apiKey/agentId are missing', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    // Missing apiKey and agentId
    const service = new FibeSyncService(mockConfig as never);
    service.syncMessages(() => '{}');
  });

  test('syncMessages makes PUT request when fully configured', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response('', { status: 200 })
    ) as unknown as typeof fetch;

    try {
      const service = new FibeSyncService(mockConfig as never);
      service.syncMessages(() => '{"data":"test"}');
      // Wait for debounce timer to fire
      await new Promise((r) => setTimeout(r, 600));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/agent-1/messages',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer key123',
          },
          body: JSON.stringify({ content: '{"data":"test"}', conversation_id: 'default' }),
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
    globalThis.fetch = mock(async () =>
      new Response('', { status: 200 })
    ) as unknown as typeof fetch;

    try {
      const service = new FibeSyncService(mockConfig as never);
      service.syncActivity(() => '[]');
      // Wait for debounce timer to fire
      await new Promise((r) => setTimeout(r, 600));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/agent-1/activity',
        expect.objectContaining({ method: 'PUT' }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('syncRawProviders makes PUT request with raw_providers endpoint', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response('', { status: 200 })
    ) as unknown as typeof fetch;

    try {
      const service = new FibeSyncService(mockConfig as never);
      service.syncRawProviders(() => '[{"id":"raw-1"}]');
      // Wait for debounce timer to fire
      await new Promise((r) => setTimeout(r, 600));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/agent-1/raw_providers',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ content: '[{"id":"raw-1"}]', conversation_id: 'default' }),
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
    globalThis.fetch = mock(async () =>
      new Response('', { status: 200 })
    ) as unknown as typeof fetch;

    const service = new FibeSyncService(mockConfig as never);
    try {
      service.syncMessages(() => '{"conversation":"a"}', 'conv-a');
      service.syncMessages(() => '{"conversation":"b"}', 'conv-b');
      await new Promise((r) => setTimeout(r, 600));

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/agent-1/messages',
        expect.objectContaining({
          body: JSON.stringify({ content: '{"conversation":"a"}', conversation_id: 'conv-a' }),
        }),
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/agent-1/messages',
        expect.objectContaining({
          body: JSON.stringify({ content: '{"conversation":"b"}', conversation_id: 'conv-b' }),
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
      await new Promise((r) => setTimeout(r, 600));
      content = '{"attempt":"second"}';
      await new Promise((r) => setTimeout(r, 1200));

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        'https://fibe.test/api/agents/agent-1/messages',
        expect.objectContaining({
          body: JSON.stringify({ content: '{"attempt":"second"}', conversation_id: 'conv-retry' }),
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
    globalThis.fetch = mock(async () =>
      new Response('Server Error', { status: 500 })
    ) as unknown as typeof fetch;

    const service = new FibeSyncService(mockConfig as never);
    try {
      // Should not throw
      service.syncMessages(() => '{}');
      await new Promise((r) => setTimeout(r, 600));
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
      await new Promise((r) => setTimeout(r, 600));
    } finally {
      service.onModuleDestroy();
      globalThis.fetch = originalFetch;
    }
  });
});
