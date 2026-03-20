import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { PhoenixSyncService } from './phoenix-sync.service';

describe('PhoenixSyncService', () => {
  const envBackup: Record<string, string | undefined> = {};

  const mockConfig = {
    isPhoenixSyncEnabled: () => false,
    getPhoenixApiUrl: () => undefined as string | undefined,
    getPhoenixApiKey: () => undefined as string | undefined,
    getPhoenixAgentId: () => undefined as string | undefined,
  };

  beforeEach(() => {
    envBackup.PHOENIX_SYNC_ENABLED = process.env.PHOENIX_SYNC_ENABLED;
    mockConfig.isPhoenixSyncEnabled = () => false;
    mockConfig.getPhoenixApiUrl = () => undefined;
    mockConfig.getPhoenixApiKey = () => undefined;
    mockConfig.getPhoenixAgentId = () => undefined;
  });

  afterEach(() => {
    process.env.PHOENIX_SYNC_ENABLED = envBackup.PHOENIX_SYNC_ENABLED;
  });

  test('syncMessages does nothing when sync is disabled', async () => {
    const service = new PhoenixSyncService(mockConfig as never);
    // Should not throw
    await service.syncMessages('{"messages":[]}');
  });

  test('syncActivity does nothing when sync is disabled', async () => {
    const service = new PhoenixSyncService(mockConfig as never);
    await service.syncActivity('[]');
  });

  test('sync does nothing when apiUrl/apiKey/agentId are missing', async () => {
    mockConfig.isPhoenixSyncEnabled = () => true;
    mockConfig.getPhoenixApiUrl = () => 'https://phoenix.test';
    // Missing apiKey and agentId
    const service = new PhoenixSyncService(mockConfig as never);
    await service.syncMessages('{}');
  });

  test('syncMessages makes PUT request when fully configured', async () => {
    mockConfig.isPhoenixSyncEnabled = () => true;
    mockConfig.getPhoenixApiUrl = () => 'https://phoenix.test';
    mockConfig.getPhoenixApiKey = () => 'key123';
    mockConfig.getPhoenixAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response('', { status: 200 })
    ) as typeof fetch;

    try {
      const service = new PhoenixSyncService(mockConfig as never);
      await service.syncMessages('{"data":"test"}');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://phoenix.test/api/agents/agent-1/messages',
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
    mockConfig.isPhoenixSyncEnabled = () => true;
    mockConfig.getPhoenixApiUrl = () => 'https://phoenix.test';
    mockConfig.getPhoenixApiKey = () => 'key123';
    mockConfig.getPhoenixAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response('', { status: 200 })
    ) as typeof fetch;

    try {
      const service = new PhoenixSyncService(mockConfig as never);
      await service.syncActivity('[]');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://phoenix.test/api/agents/agent-1/activity',
        expect.objectContaining({ method: 'PUT' }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('handles non-ok response without throwing', async () => {
    mockConfig.isPhoenixSyncEnabled = () => true;
    mockConfig.getPhoenixApiUrl = () => 'https://phoenix.test';
    mockConfig.getPhoenixApiKey = () => 'key123';
    mockConfig.getPhoenixAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response('Server Error', { status: 500 })
    ) as typeof fetch;

    try {
      const service = new PhoenixSyncService(mockConfig as never);
      // Should not throw
      await service.syncMessages('{}');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('handles network error without throwing', async () => {
    mockConfig.isPhoenixSyncEnabled = () => true;
    mockConfig.getPhoenixApiUrl = () => 'https://phoenix.test';
    mockConfig.getPhoenixApiKey = () => 'key123';
    mockConfig.getPhoenixAgentId = () => 'agent-1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    try {
      const service = new PhoenixSyncService(mockConfig as never);
      await service.syncMessages('{}');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
