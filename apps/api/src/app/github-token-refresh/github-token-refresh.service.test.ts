import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { GithubTokenRefreshService } from './github-token-refresh.service';

const mockConfig = {
  getPhoenixApiUrl: () => undefined as string | undefined,
  getPhoenixApiKey: () => undefined as string | undefined,
  getPhoenixAgentId: () => undefined as string | undefined,
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

  test('skips refresh when Phoenix config is missing', async () => {
    mockConfig.getPhoenixApiUrl = () => undefined;
    mockConfig.getPhoenixApiKey = () => undefined;
    mockConfig.getPhoenixAgentId = () => undefined;

    const result = await service.refreshToken();
    expect(result).toBeNull();
  });

  test('fetches token and updates MCP_CONFIG_JSON', async () => {
    mockConfig.getPhoenixApiUrl = () => 'https://phoenix.test';
    mockConfig.getPhoenixApiKey = () => 'plgr_test123';
    mockConfig.getPhoenixAgentId = () => '42';

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
        'https://phoenix.test/api/agents/42/github_token',
        {
          method: 'GET',
          headers: { Authorization: 'Bearer plgr_test123' },
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
    mockConfig.getPhoenixApiUrl = () => 'https://phoenix.test';
    mockConfig.getPhoenixApiKey = () => 'plgr_test123';
    mockConfig.getPhoenixAgentId = () => '42';

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
    mockConfig.getPhoenixApiUrl = () => 'https://phoenix.test';
    mockConfig.getPhoenixApiKey = () => 'plgr_test123';
    mockConfig.getPhoenixAgentId = () => '42';

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
    mockConfig.getPhoenixApiUrl = () => 'https://phoenix.test';
    mockConfig.getPhoenixApiKey = () => 'plgr_test123';
    mockConfig.getPhoenixAgentId = () => '42';

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
        'playgrounds-dev': { serverUrl: 'https://test/mcp' },
        Sentry: { serverUrl: 'https://sentry/mcp' },
      },
    });

    mockConfig.getPhoenixApiUrl = () => 'https://phoenix.test';
    mockConfig.getPhoenixApiKey = () => 'plgr_test123';
    mockConfig.getPhoenixAgentId = () => '42';

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
      expect(config.mcpServers['playgrounds-dev'].serverUrl).toBe(
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
});
