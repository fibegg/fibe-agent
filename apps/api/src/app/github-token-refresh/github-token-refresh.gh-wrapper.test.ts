import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GithubTokenRefreshService } from './github-token-refresh.service';
import {
  githubOrganization,
  withGhWrapper,
} from './github-git-credentials';

const mockConfig = {
  getFibeApiUrl: () => 'https://fibe.test' as string | undefined,
  getFibeApiKey: () => 'fibe_test123' as string | undefined,
};
const tokenResponse = (token: string, account: string) =>
  new Response(JSON.stringify({ token, expires_in: 3000, account }), {
    status: 200,
  });

describe('gh wrapper and MCP token by repository organization', () => {
  let service: GithubTokenRefreshService;
  let originalFetch: typeof fetch;
  let envBackup: Record<string, string | undefined>;
  let root: string;
  let kill: ReturnType<typeof spyOn>;
  let repos: () => Promise<unknown[]>;

  const mcpToken = () =>
    JSON.parse(
      readFileSync(join(process.env.SESSION_DIR as string, 'settings.json'), 'utf8'),
    ).mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  const start = () => {
    service = new GithubTokenRefreshService(mockConfig as never, {
      getRepos: () => repos(),
    } as never);
    kill = spyOn(
      service as unknown as { killGithubMcpServer(): void },
      'killGithubMcpServer',
    ).mockImplementation(() => undefined);
  };
  /** Runs the installed wrapper under dash; the fake gh prints token, args and exits 7. */
  const gh = (args: string[], cwd = root, env: Record<string, string> = {}) => {
    const dir = process.env.FIBE_GH_WRAPPER_DIR as string;
    const result = spawnSync('dash', [join(dir, 'gh'), ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    const [token, argv] = result.stdout.split('\n');
    return { token, argv, status: result.status, stderr: result.stderr };
  };
  const repoWithOrigin = (name: string, url: string) => {
    const dir = join(root, name);
    mkdirSync(dir);
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['remote', 'add', 'origin', url], { cwd: dir });
    return dir;
  };

  beforeEach(() => {
    envBackup = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (/^(GIT_CONFIG_|GH_|GITHUB_TOKEN$|MCP_CONFIG_JSON$)/.test(key))
        delete process.env[key];
    }
    root = mkdtempSync(join(tmpdir(), 'fibe-gh-wrapper-'));
    const fake = join(root, 'fakebin');
    mkdirSync(fake);
    writeFileSync(
      join(fake, 'gh'),
      '#!/bin/sh\nprintf "%s\\n%s\\n" "$GH_TOKEN" "$*"\nexit 7\n',
    );
    chmodSync(join(fake, 'gh'), 0o755);
    process.env.PATH = `${fake}:${process.env.PATH}`;
    process.env.SESSION_DIR = join(root, 'session');
    mkdirSync(process.env.SESSION_DIR);
    process.env.AGENT_PROVIDER = 'gemini';
    process.env.FIBE_GITHUB_CONNECTION_ID = '7';
    process.env.FIBE_GITHUB_CONNECTION_IDS = '7,9';
    process.env.FIBE_GITHUB_CONNECTION_OWNER = 'Team';
    repos = async () => [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) =>
      /\/9\/token$/.test(String(url))
        ? tokenResponse('ghs_nine', 'Second-Org')
        : tokenResponse('ghs_seven', 'First-Org'),
    ) as unknown as typeof fetch;
    start();
  });

  afterEach(() => {
    service.onModuleDestroy();
    globalThis.fetch = originalFetch;
    rmSync(root, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) delete process.env[key];
    }
    Object.assign(process.env, envBackup);
    mock.restore();
  });

  test('picks the token by -R, GH_REPO, then the origin remote (https and ssh), else the primary', async () => {
    await service.refreshToken();
    expect(process.env.PATH?.startsWith(process.env.FIBE_GH_WRAPPER_DIR as string)).toBe(true);
    expect(gh(['pr', 'list', '-R', 'second-org/x'])).toMatchObject({ token: 'ghs_nine', argv: 'pr list -R second-org/x' });
    expect(gh(['pr', '--repo', 'Second-Org/x']).token).toBe('ghs_nine');
    expect(gh(['pr', '--repo=github.com/second-org/x']).token).toBe('ghs_nine');
    expect(gh(['pr', '-Rsecond-org/x']).token).toBe('ghs_nine');
    expect(gh(['pr', '-R', 'https://github.com/second-org/x']).token).toBe('ghs_nine');
    expect(gh(['pr', '-R', 'ghe.example.com/second-org/x']).token).toBe('ghs_seven');
    expect(gh(['pr'], root, { GH_REPO: 'second-org/x' }).token).toBe('ghs_nine');
    expect(gh(['pr', '-R', 'first-org/x'], root, { GH_REPO: 'second-org/x' }).token).toBe('ghs_seven');
    const https = repoWithOrigin('https', 'https://user@github.com/Second-Org/r.git');
    const ssh = repoWithOrigin('ssh', 'git@github.com:second-org/r.git');
    const sshUrl = repoWithOrigin('sshurl', 'ssh://git@github.com/second-org/r');
    const other = repoWithOrigin('other', 'https://gitlab.com/second-org/r.git');
    expect(gh(['pr'], https).token).toBe('ghs_nine');
    expect(gh(['pr'], ssh).token).toBe('ghs_nine');
    expect(gh(['pr'], sshUrl).token).toBe('ghs_nine');
    expect(gh(['pr'], other).token).toBe('ghs_seven');
    // No repository, unknown organization, argument after `--`: primary.
    expect(gh(['auth', 'status']).token).toBe('ghs_seven');
    expect(gh(['pr', '-R', 'nobody/x']).token).toBe('ghs_seven');
    expect(gh(['api', '--', '-R', 'second-org/x']).token).toBe('ghs_seven');
    // Exit code passes through.
    expect(gh(['pr']).status).toBe(7);
  });

  test('runs the real gh untouched without tokens, and is not installed for an authored GH_TOKEN', async () => {
    await service.refreshToken();
    const dir = process.env.FIBE_GH_WRAPPER_DIR as string;
    writeFileSync(join(dir, '..', 'tokens'), '');
    delete process.env.GH_TOKEN; // untouched: only the inherited environment reaches gh
    expect(gh(['pr'])).toMatchObject({ token: '', status: 7 });
    service.onModuleDestroy();
    delete process.env.FIBE_GH_WRAPPER_DIR;
    process.env.GH_TOKEN = 'authored';
    start();
    await service.refreshToken();
    expect(process.env.FIBE_GH_WRAPPER_DIR).toBeUndefined();
    expect(process.env.GH_TOKEN).toBe('authored');
  });

  test('is not installed without a real gh or when multi mode is off', async () => {
    service.onModuleDestroy();
    process.env.PATH = '/nonexistent';
    start();
    await service.refreshToken();
    expect(process.env.FIBE_GH_WRAPPER_DIR).toBeUndefined();
    service.onModuleDestroy();
    process.env.PATH = envBackup.PATH;
    delete process.env.FIBE_GITHUB_CONNECTION_IDS;
    delete process.env.FIBE_GITHUB_CONNECTION_OWNER;
    start();
    await service.refreshToken();
    expect(process.env.FIBE_GH_WRAPPER_DIR).toBeUndefined();
    expect(process.env.PATH).toBe(envBackup.PATH);
  });

  test('MCP token follows the Agent repository organization and falls back silently', async () => {
    // Empty Playground (the normal case): primary, no restart.
    await service.onModuleInit();
    expect(mcpToken()).toBe('ghs_seven');
    // A failing lookup (missing directory) and a dangling link change nothing.
    repos = async () => {
      throw new Error('ENOENT');
    };
    await service.refreshToken();
    expect(mcpToken()).toBe('ghs_seven');
    const dangling = join(root, 'dangling');
    symlinkSync(join(root, 'gone'), dangling);
    repos = async () => [{ repo_root: dangling, service: 'web', link_path: 'x', target: 'y' }];
    await service.refreshToken();
    expect(mcpToken()).toBe('ghs_seven');
    expect(kill).not.toHaveBeenCalled();
    // A Playground linked later switches the token and restarts the server once.
    repos = async () => [{ repo_root: dangling, repository: 'second-org/app', service: 'web', link_path: 'x', target: 'y' }];
    await service.refreshToken();
    expect(mcpToken()).toBe('ghs_nine');
    expect(kill).toHaveBeenCalledTimes(1);
    await service.refreshToken();
    expect(kill).toHaveBeenCalledTimes(1);
    // The origin remote serves when the repository name is missing; an unheld org keeps the choice's fallback.
    const dir = repoWithOrigin('app', 'git@github.com:first-org/app.git');
    repos = async () => [{ repo_root: dir, service: 'web', link_path: 'x', target: 'y' }];
    await service.refreshToken();
    expect(mcpToken()).toBe('ghs_seven');
    repos = async () => [{ repo_root: dir, repository: 'stranger/app', service: 'web', link_path: 'x', target: 'y' }];
    await service.refreshToken();
    expect(mcpToken()).toBe('ghs_seven');
    // Link removed again: primary.
    repos = async () => [];
    await service.refreshToken();
    expect(mcpToken()).toBe('ghs_seven');
    // GH_TOKEN stays the primary snapshot throughout.
    expect(process.env.GH_TOKEN).toBe('ghs_seven');
  });
});

describe('githubOrganization and withGhWrapper', () => {
  test('parses repository specs and remotes', () => {
    expect(githubOrganization('Org/repo')).toBe('org');
    expect(githubOrganization('github.com/Org/repo')).toBe('org');
    expect(githubOrganization('https://x:y@github.com/Org/repo.git')).toBe('org');
    expect(githubOrganization('git@github.com:Org/repo.git\n')).toBe('org');
    expect(githubOrganization('ssh://git@github.com/Org/repo')).toBe('org');
    expect(githubOrganization('https://gitlab.com/org/repo')).toBeNull();
    expect(githubOrganization('ghe.example.com/org/repo')).toBeNull();
    expect(githubOrganization(undefined)).toBeNull();
    expect(githubOrganization('')).toBeNull();
  });
  test('puts the wrapper directory first once', () => {
    expect(withGhWrapper('/a:/b', {})).toBe('/a:/b');
    expect(withGhWrapper('/a:/w:/b', { FIBE_GH_WRAPPER_DIR: '/w' })).toBe('/w:/a:/b');
  });
});
