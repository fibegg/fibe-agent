import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GithubTokenRefreshService } from './github-token-refresh.service';

const mockConfig = {
  getFibeApiUrl: () => 'https://fibe.test' as string | undefined,
  getFibeApiKey: () => 'fibe_test123' as string | undefined,
};
const tokenResponse = (token = 'ghs_fresh_token', expires_in = 3000) =>
  new Response(JSON.stringify({ token, expires_in }), { status: 200 });

describe('GithubTokenRefreshService', () => {
  let service: GithubTokenRefreshService;
  let originalFetch: typeof fetch;
  let kill: ReturnType<typeof spyOn>;
  const envBackup: Record<string, string | undefined> = {};
  const configPath = () =>
    join(process.env.SESSION_DIR as string, 'settings.json');
  const writtenServers = () =>
    JSON.parse(readFileSync(configPath(), 'utf8')).mcpServers;

  beforeEach(() => {
    for (const key of [
      'MCP_CONFIG_JSON',
      'FIBE_GITHUB_CONNECTION_ID',
      'FIBE_GITHUB_CONNECTION_OWNER',
      'SESSION_DIR',
      'AGENT_PROVIDER',
    ])
      envBackup[key] = process.env[key];
    process.env.SESSION_DIR = mkdtempSync(
      join(tmpdir(), 'fibe-github-refresh-'),
    );
    process.env.AGENT_PROVIDER = 'gemini';
    process.env.FIBE_GITHUB_CONNECTION_ID = '42';
    delete process.env.FIBE_GITHUB_CONNECTION_OWNER;
    delete process.env.MCP_CONFIG_JSON;
    mockConfig.getFibeApiUrl = () => 'https://fibe.test';
    mockConfig.getFibeApiKey = () => 'fibe_test123';
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => tokenResponse()) as typeof fetch;
    service = new GithubTokenRefreshService(mockConfig as never);
    kill = spyOn(
      service as unknown as { killGithubMcpServer(): void },
      'killGithubMcpServer',
    ).mockImplementation(() => undefined);
  });

  afterEach(() => {
    service.onModuleDestroy();
    globalThis.fetch = originalFetch;
    rmSync(process.env.SESSION_DIR as string, { recursive: true, force: true });
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    mock.restore();
  });

  test('requires API config and an explicit installation connection', async () => {
    delete process.env.FIBE_GITHUB_CONNECTION_ID;
    expect(await service.refreshToken()).toBeNull();
    process.env.FIBE_GITHUB_CONNECTION_ID = '42';
    mockConfig.getFibeApiKey = () => undefined;
    expect(await service.refreshToken()).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(existsSync(configPath())).toBe(false);
  });

  test('fetches the selected connection using the existing endpoint and writes the official MCP command', async () => {
    expect(await service.refreshToken()).toBe('ghs_fresh_token');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://fibe.test/api/installations/42/token',
      {
        method: 'GET',
        signal: expect.any(AbortSignal),
        headers: { Authorization: 'Bearer fibe_test123' },
      },
    );
    expect(writtenServers().github).toEqual({
      command: 'mcp-github',
      args: [],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghs_fresh_token' },
    });
  });

  test('refreshes a company-owned connection through its owner-bound endpoint', async () => {
    process.env.FIBE_GITHUB_CONNECTION_OWNER = 'Team';
    expect(await service.refreshToken()).toBe('ghs_fresh_token');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://fibe.test/api/company_git_installations/42/token',
      expect.any(Object),
    );
  });

  test('rejects an invalid connection-owner marker before contacting an endpoint', async () => {
    process.env.FIBE_GITHUB_CONNECTION_OWNER = 'another-team';
    expect(await service.refreshToken()).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(writtenServers().github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('');
  });

  test('preserves custom servers and the existing GitHub command, arguments and unrelated environment', async () => {
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        Sentry: { command: 'sentry' },
        github: {
          command: 'mcp-github',
          args: ['--read-only'],
          env: { EXTRA: 'kept', GITHUB_PERSONAL_ACCESS_TOKEN: 'old' },
        },
      },
    });
    await service.refreshToken();
    expect(writtenServers().github).toEqual({
      command: 'mcp-github',
      args: ['--read-only'],
      env: { EXTRA: 'kept', GITHUB_PERSONAL_ACCESS_TOKEN: 'ghs_fresh_token' },
    });
    expect(writtenServers().Sentry.command).toBe('sentry');
  });

  for (const status of [401, 403, 404]) {
    test(`clears the previous token from the persisted provider config on ${status} and stops its MCP process`, async () => {
      await service.refreshToken();
      globalThis.fetch = mock(
        async () => new Response('', { status }),
      ) as typeof fetch;
      expect(await service.refreshToken()).toBeNull();
      expect(writtenServers().github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('');
      expect(kill).toHaveBeenCalledTimes(1);
    });
  }

  test('preserves an unexpired token on transient provider failure', async () => {
    await service.refreshToken();
    globalThis.fetch = mock(
      async () => new Response('', { status: 503 }),
    ) as typeof fetch;
    expect(await service.refreshToken()).toBeNull();
    expect(writtenServers().github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe(
      'ghs_fresh_token',
    );
    expect(kill).not.toHaveBeenCalled();
  });

  test('clears an expired token after a network failure', async () => {
    await service.refreshToken();
    const now = Date.now();
    spyOn(Date, 'now').mockReturnValue(now + 3600_000);
    globalThis.fetch = mock(async () => {
      throw new Error('unavailable');
    }) as typeof fetch;
    expect(await service.refreshToken()).toBeNull();
    expect(writtenServers().github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('');
  });

  test('rejects an invalid token lifetime and clears an expired token', async () => {
    await service.refreshToken();
    const now = Date.now();
    spyOn(Date, 'now').mockReturnValue(now + 3600_000);
    globalThis.fetch = mock(async () =>
      tokenResponse('new', 0),
    ) as typeof fetch;
    expect(await service.refreshToken()).toBeNull();
    expect(writtenServers().github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('');
  });

  test('coalesces overlapping refreshes into one network call', async () => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    globalThis.fetch = mock(() => promise) as typeof fetch;
    const first = service.refreshToken();
    const second = service.refreshToken();
    expect(first).toBe(second);
    resolve(tokenResponse());
    expect(await first).toBe('ghs_fresh_token');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('aborts and ignores a response that arrives after shutdown', async () => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    let signal: AbortSignal | undefined;
    globalThis.fetch = mock((_url, options) => {
      signal = options?.signal as AbortSignal;
      return promise;
    }) as typeof fetch;
    const running = service.refreshToken();
    service.onModuleDestroy();
    resolve(tokenResponse());
    expect(await running).toBeNull();
    expect(signal?.aborted).toBe(true);
    expect(existsSync(configPath())).toBe(false);
    expect(await service.refreshToken()).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('refreshes before the returned expiry and restarts the MCP process only after initialization', async () => {
    const timeout = spyOn(globalThis, 'setTimeout');
    globalThis.fetch = mock(async () =>
      tokenResponse('token', 900),
    ) as typeof fetch;
    await service.onModuleInit();
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 600_000);
    expect(kill).not.toHaveBeenCalled();
    await service.refreshToken();
    expect(kill).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
    service.onModuleDestroy();
  });

  test('can initialize an absent or malformed MCP config', async () => {
    process.env.MCP_CONFIG_JSON = 'invalid-json';
    expect(await service.refreshToken()).toBe('ghs_fresh_token');
    expect(writtenServers().github.command).toBe('mcp-github');
  });
});
