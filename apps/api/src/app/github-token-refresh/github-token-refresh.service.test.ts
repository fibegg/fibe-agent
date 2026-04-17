import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { GithubTokenRefreshService } from './github-token-refresh.service';

const mockConfig = {
  getFibeApiUrl: () => undefined as string | undefined,
  getFibeApiKey: () => undefined as string | undefined,
  getFibeAgentId: () => undefined as string | undefined,
};

describe('GithubTokenRefreshService', () => {
  let service: GithubTokenRefreshService;
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.MCP_CONFIG_JSON = process.env.MCP_CONFIG_JSON;
    delete process.env.MCP_CONFIG_JSON;
    service = new GithubTokenRefreshService(mockConfig as never);
  });

  afterEach(() => {
    service.onModuleDestroy();
    process.env.MCP_CONFIG_JSON = envBackup.MCP_CONFIG_JSON;
  });

  test('skips refresh when Fibe config is missing', async () => {
    mockConfig.getFibeApiUrl = () => undefined;
    mockConfig.getFibeApiKey = () => undefined;
    mockConfig.getFibeAgentId = () => undefined;

    const result = await service.refreshToken();
    expect(result).toBeNull();
  });

  test('fetches token and updates MCP_CONFIG_JSON', async () => {
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'fibe_test123';
    mockConfig.getFibeAgentId = () => '42';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ token: 'ghs_fresh_token', expires_in: 3000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as typeof fetch;

    try {
      const result = await service.refreshToken();

      expect(result).toBe('ghs_fresh_token');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://fibe.test/api/agents/42/github_token',
        {
          method: 'GET',
          headers: { Authorization: 'Bearer fibe_test123' },
        }
      );

      // Verify MCP_CONFIG_JSON was updated
      const config = JSON.parse(process.env.MCP_CONFIG_JSON as string);
      expect(config.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe(
        'ghs_fresh_token'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns null on 404 (no GitHub App installed)', async () => {
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'fibe_test123';
    mockConfig.getFibeAgentId = () => '42';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response('Not Found', { status: 404 })
    ) as typeof fetch;

    try {
      const result = await service.refreshToken();
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns null on server error', async () => {
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'fibe_test123';
    mockConfig.getFibeAgentId = () => '42';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response('Internal Server Error', { status: 500 })
    ) as typeof fetch;

    try {
      const result = await service.refreshToken();
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns null on network error', async () => {
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'fibe_test123';
    mockConfig.getFibeAgentId = () => '42';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    try {
      const result = await service.refreshToken();
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('preserves existing MCP config when updating token', async () => {
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        'fibe': { serverUrl: 'https://test/mcp' },
        Sentry: { serverUrl: 'https://sentry/mcp' },
      },
    });

    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'fibe_test123';
    mockConfig.getFibeAgentId = () => '42';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ token: 'ghs_new_token', expires_in: 3000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as typeof fetch;

    try {
      await service.refreshToken();

      const config = JSON.parse(process.env.MCP_CONFIG_JSON as string);
      expect(config.mcpServers['fibe'].serverUrl).toBe(
        'https://test/mcp'
      );
      expect(config.mcpServers.Sentry.serverUrl).toBe('https://sentry/mcp');
      expect(config.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe(
        'ghs_new_token'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('onModuleInit runs initial refresh and schedules timer', async () => {
    mockConfig.getFibeApiUrl = () => undefined;
    mockConfig.getFibeApiKey = () => undefined;
    mockConfig.getFibeAgentId = () => undefined;

    await service.onModuleInit();
    // Timer should be set — calling onModuleDestroy clears it
    service.onModuleDestroy();
  });

  test('onModuleDestroy is safe when called multiple times', () => {
    service.onModuleDestroy();
    service.onModuleDestroy(); // second call should not throw
  });

  test('returns null when response has no token field', async () => {
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key';
    mockConfig.getFibeAgentId = () => '1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as typeof fetch;

    try {
      const result = await service.refreshToken();
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('periodic refresh calls killGithubMcpServer after initial', async () => {
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key';
    mockConfig.getFibeAgentId = () => '1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ token: 'ghs_123', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as typeof fetch;

    try {
      // First call is the initial refresh
      await service.onModuleInit();
      // Second call simulates periodic refresh (isInitialRefresh is now false)
      const result = await service.refreshToken();
      expect(result).toBe('ghs_123');
    } finally {
      globalThis.fetch = originalFetch;
      service.onModuleDestroy();
    }
  });

  test('handles invalid MCP_CONFIG_JSON gracefully during token update', async () => {
    process.env.MCP_CONFIG_JSON = 'invalid-json';
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'key';
    mockConfig.getFibeAgentId = () => '1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ token: 'ghs_abc', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as typeof fetch;

    try {
      const result = await service.refreshToken();
      expect(result).toBe('ghs_abc');
      const config = JSON.parse(process.env.MCP_CONFIG_JSON);
      expect(config.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('ghs_abc');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
