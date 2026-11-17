import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GithubTokenRefreshService } from './github-token-refresh.service';
import { configureGitCredentialHelper } from './github-git-credentials';

const mockConfig = {
  getFibeApiUrl: () => 'https://fibe.test' as string | undefined,
  getFibeApiKey: () => 'fibe_test123' as string | undefined,
};
const tokenResponse = (token: string, account?: string, expires_in = 3000) =>
  new Response(JSON.stringify({ token, expires_in, account }), {
    status: 200,
  });
const failure = (status: number) => () => new Response('', { status });

describe('GithubTokenRefreshService with every Team installation', () => {
  let service: GithubTokenRefreshService;
  let originalFetch: typeof fetch;
  let kill: ReturnType<typeof spyOn>;
  let envBackup: Record<string, string | undefined>;
  let replies: Record<string, () => Response>;
  const configPath = () =>
    join(process.env.SESSION_DIR as string, 'settings.json');
  const mcpToken = () =>
    JSON.parse(readFileSync(configPath(), 'utf8')).mcpServers.github.env
      .GITHUB_PERSONAL_ACCESS_TOKEN;
  const requested = () =>
    (globalThis.fetch as ReturnType<typeof mock>).mock.calls.map(
      ([url]) => url,
    );
  const start = () => {
    service = new GithubTokenRefreshService(mockConfig as never);
    kill = spyOn(
      service as unknown as { killGithubMcpServer(): void },
      'killGithubMcpServer',
    ).mockImplementation(() => undefined);
  };
  const helperPath = () => {
    const count = Number(process.env.GIT_CONFIG_COUNT ?? 0);
    for (let i = 0; i < count; i += 1) {
      if (
        process.env[`GIT_CONFIG_KEY_${i}`] ===
        'credential.https://github.com.helper'
      )
        return (process.env[`GIT_CONFIG_VALUE_${i}`] as string).slice(2, -1);
    }
    throw new Error('no GitHub credential helper configured');
  };
  /** What real Git answers for a repository path with only this process's configuration. */
  const gitPassword = (path: string) => {
    const env: Record<string, string | undefined> = {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
      HOME: process.env.SESSION_DIR,
    };
    delete env.GIT_ASKPASS;
    delete env.SSH_ASKPASS;
    const output = execFileSync('git', ['credential', 'fill'], {
      cwd: process.env.SESSION_DIR,
      env,
      input: `protocol=https\nhost=github.com\npath=${path}\n\n`,
      encoding: 'utf8',
    });
    expect(output).toContain('username=x-access-token\n');
    return /^password=(.*)$/m.exec(output)?.[1];
  };

  beforeEach(() => {
    envBackup = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (/^(GIT_CONFIG_|GH_TOKEN$|GITHUB_TOKEN$|MCP_CONFIG_JSON$)/.test(key))
        delete process.env[key];
    }
    process.env.SESSION_DIR = mkdtempSync(
      join(tmpdir(), 'fibe-github-installations-'),
    );
    process.env.AGENT_PROVIDER = 'gemini';
    process.env.FIBE_GITHUB_CONNECTION_ID = '7';
    process.env.FIBE_GITHUB_CONNECTION_IDS = '7,9,-3';
    process.env.FIBE_GITHUB_CONNECTION_OWNER = 'Team';
    replies = {
      '7': () => tokenResponse('ghs_seven', 'VibrezUniverse'),
      '9': () => tokenResponse('ghs_nine', 'Project-VU'),
      '-3': () => tokenResponse('ghs_three', 'third-org'),
    };
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const id = /\/(-?\d+)\/token$/.exec(String(url))?.[1] ?? '';
      return replies[id]();
    }) as unknown as typeof fetch;
    start();
  });

  afterEach(() => {
    service.onModuleDestroy();
    globalThis.fetch = originalFetch;
    rmSync(process.env.SESSION_DIR as string, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) delete process.env[key];
    }
    Object.assign(process.env, envBackup);
    mock.restore();
  });

  test('refreshes every listed installation and gives Git the token of each organization', async () => {
    expect(await service.refreshToken()).toBe('ghs_seven');
    expect(requested()).toEqual([
      'https://fibe.test/api/team_git_installations/7/token',
      'https://fibe.test/api/team_git_installations/9/token',
      'https://fibe.test/api/team_git_installations/-3/token',
    ]);
    // Single-token consumers get the first installation.
    expect(mcpToken()).toBe('ghs_seven');
    expect(process.env.GH_TOKEN).toBe('ghs_seven');
    expect(kill).not.toHaveBeenCalled();
    // Git chooses by organization, case-insensitively, else the first token.
    expect(gitPassword('Project-VU/vibrez-platform.git')).toBe('ghs_nine');
    expect(gitPassword('vibrezuniverse/vibrez.git')).toBe('ghs_seven');
    expect(gitPassword('THIRD-ORG/repo')).toBe('ghs_three');
    expect(gitPassword('someone-else/repo.git')).toBe('ghs_seven');
    // The helper answers only GitHub HTTPS lookups and only `get`.
    const helper = helperPath();
    const ask = (action: string, input: string) =>
      execFileSync(helper, [action], { input, encoding: 'utf8' });
    expect(ask('get', 'protocol=https\nhost=gitlab.com\npath=a/b\n\n')).toBe(
      '',
    );
    expect(ask('get', 'protocol=http\nhost=github.com\npath=a/b\n\n')).toBe('');
    expect(ask('store', 'protocol=https\nhost=github.com\npath=a/b\n\n')).toBe(
      '',
    );
    // Tokens stay in a private directory, never in Git configuration files.
    const dir = join(helper, '..');
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'tokens')).mode & 0o777).toBe(0o600);
    expect(
      Object.entries(process.env)
        .filter(([key]) => key.startsWith('GIT_CONFIG_'))
        .some(([, value]) => value?.includes('ghs_')),
    ).toBe(false);
  });

  test('keeps the other installations when one fails and promotes the next primary', async () => {
    replies['7'] = failure(404);
    await service.onModuleInit();
    expect(mcpToken()).toBe('ghs_nine');
    expect(process.env.GH_TOKEN).toBe('ghs_nine');
    expect(gitPassword('project-vu/vibrez-platform')).toBe('ghs_nine');
    expect(gitPassword('third-org/repo')).toBe('ghs_three');
    // Without its own token an organization falls back to the primary.
    expect(gitPassword('vibrezuniverse/vibrez')).toBe('ghs_nine');
    expect(kill).not.toHaveBeenCalled();

    // The first installation recovers while another has a transient failure:
    // the recovered one is primary again, the other keeps its unexpired token.
    replies['7'] = () => tokenResponse('ghs_seven_2', 'VibrezUniverse');
    replies['9'] = failure(503);
    expect(await service.refreshToken()).toBe('ghs_seven_2');
    expect(mcpToken()).toBe('ghs_seven_2');
    expect(process.env.GH_TOKEN).toBe('ghs_seven_2');
    expect(gitPassword('vibrezuniverse/vibrez')).toBe('ghs_seven_2');
    expect(gitPassword('project-vu/vibrez-platform')).toBe('ghs_nine');
    expect(kill).toHaveBeenCalledTimes(1);

    // A withdrawn non-primary installation leaves the MCP server running.
    replies['9'] = failure(403);
    replies['-3'] = () => {
      throw new Error('unavailable');
    };
    expect(await service.refreshToken()).toBe('ghs_seven_2');
    expect(gitPassword('project-vu/vibrez-platform')).toBe('ghs_seven_2');
    expect(gitPassword('third-org/repo')).toBe('ghs_three');
    expect(kill).toHaveBeenCalledTimes(1);
  });

  test('clears the primary token everywhere when every installation is withdrawn', async () => {
    await service.onModuleInit();
    for (const id of Object.keys(replies)) replies[id] = failure(404);
    expect(await service.refreshToken()).toBeNull();
    expect(mcpToken()).toBe('');
    expect(process.env.GH_TOKEN).toBeUndefined();
    expect(kill).toHaveBeenCalledTimes(1);
    const helper = helperPath();
    expect(
      execFileSync(helper, ['get'], {
        input: 'protocol=https\nhost=github.com\npath=project-vu/r\n\n',
        encoding: 'utf8',
      }),
    ).toBe('');
  });

  test('schedules each installation from its own expiry and backoff', async () => {
    const timeout = spyOn(globalThis, 'setTimeout');
    replies['7'] = () => tokenResponse('ghs_seven', 'VibrezUniverse', 900);
    replies['-3'] = failure(503);
    await service.onModuleInit();
    const delays = timeout.mock.calls.map(([, delay]) => delay);
    expect(delays).toContain(600_000);
    expect(delays).toContain(2_700_000);
    expect(delays).toContain(60_000);
  });

  test('rejects an invalid owner marker for the whole list before contacting an endpoint', async () => {
    process.env.FIBE_GITHUB_CONNECTION_OWNER = 'another-team';
    expect(await service.refreshToken()).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mcpToken()).toBe('');
  });

  test('keeps an authored GH_TOKEN', async () => {
    service.onModuleDestroy();
    process.env.GH_TOKEN = 'authored';
    start();
    await service.refreshToken();
    expect(process.env.GH_TOKEN).toBe('authored');
    expect(gitPassword('project-vu/r')).toBe('ghs_nine');
  });

  test('without the list only the single connection is refreshed, and Git and GH_TOKEN stay untouched', async () => {
    for (const ids of [undefined, 'invalid, ,0']) {
      if (ids === undefined) delete process.env.FIBE_GITHUB_CONNECTION_IDS;
      else process.env.FIBE_GITHUB_CONNECTION_IDS = ids;
      delete process.env.FIBE_GITHUB_CONNECTION_OWNER;
      replies['42'] = () => tokenResponse('ghs_single');
      process.env.FIBE_GITHUB_CONNECTION_ID = '42';
      expect(await service.refreshToken()).toBe('ghs_single');
      expect(requested().at(-1)).toBe(
        'https://fibe.test/api/installations/42/token',
      );
      expect(mcpToken()).toBe('ghs_single');
      expect(process.env.GIT_CONFIG_COUNT).toBeUndefined();
      expect(process.env.GH_TOKEN).toBeUndefined();
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('configureGitCredentialHelper', () => {
  test('appends after existing entries once and leaves a malformed count alone', () => {
    const env: NodeJS.ProcessEnv = {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.editor',
      GIT_CONFIG_VALUE_0: 'vi',
    };
    expect(configureGitCredentialHelper("/tmp/it's/helper", env)).toBe(true);
    expect(configureGitCredentialHelper("/tmp/it's/helper", env)).toBe(true);
    expect(env).toEqual({
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'core.editor',
      GIT_CONFIG_VALUE_0: 'vi',
      GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
      GIT_CONFIG_VALUE_1: "!'/tmp/it'\\''s/helper'",
      GIT_CONFIG_KEY_2: 'credential.https://github.com.useHttpPath',
      GIT_CONFIG_VALUE_2: 'true',
    });
    const malformed: NodeJS.ProcessEnv = { GIT_CONFIG_COUNT: 'x' };
    expect(configureGitCredentialHelper('/tmp/helper', malformed)).toBe(false);
    expect(malformed).toEqual({ GIT_CONFIG_COUNT: 'x' });
  });
});
