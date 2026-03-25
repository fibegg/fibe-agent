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
    await service.syncMessages('{"messages":[]}');
  });

  test('syncActivity does nothing when sync is disabled', async () => {
    const service = new FibeSyncService(mockConfig as never);
    await service.syncActivity('[]');
  });

  test('sync does nothing when apiUrl/apiKey/agentId are missing', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    // Missing apiKey and agentId
    const service = new FibeSyncService(mockConfig as never);
    await service.syncMessages('{}');
  });

  test('syncMessages makes PUT request when fully configured', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response('', { status: 200 })
    ) as typeof fetch;

    try {
      const service = new FibeSyncService(mockConfig as never);
      await service.syncMessages('{"data":"test"}');
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
          body: JSON.stringify({ content: '{"data":"test"}' }),
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
    ) as typeof fetch;

    try {
      const service = new FibeSyncService(mockConfig as never);
      await service.syncActivity('[]');
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

  test('handles non-ok response without throwing', async () => {
    mockConfig.isFibeSyncEnabled = () => true;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key123';
    mockConfig.getFibeAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response('Server Error', { status: 500 })
    ) as typeof fetch;

    try {
      const service = new FibeSyncService(mockConfig as never);
      // Should not throw
      await service.syncMessages('{}');
    } finally {
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
    }) as typeof fetch;

    try {
      const service = new FibeSyncService(mockConfig as never);
      await service.syncMessages('{}');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
