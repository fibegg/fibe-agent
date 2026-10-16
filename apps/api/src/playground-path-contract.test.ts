import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadFibeEnv } from './load-env';
import { ConfigService } from './app/config/config.service';

const keys = [
  'FIBE_SETTINGS_JSON',
  'PLAYGROUNDS_DIR',
  'FIBE_AGENT_ID',
  'DATA_DIR',
  'CONVERSATION_ID',
  'MCP_CONFIG_JSON',
  'HOST_ROOT',
  'HOST_ROOT_DOMAIN',
  'HOST_URL_SCHEME',
];
let original: Record<string, string | undefined>;
let directory: string;
const cwd = process.cwd();

beforeEach(() => {
  original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  directory = mkdtempSync(join(tmpdir(), 'playground-path-contract-'));
  process.chdir(directory);
  directory = process.cwd();
  process.env.FIBE_SETTINGS_JSON = JSON.stringify({
    dataDir: 'runtime-data',
    fibeAgentId: 'agent-77',
  });
});

afterEach(() => {
  process.chdir(cwd);
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});

test('bootstrap exports the UI link directory to tools with another working directory', () => {
  loadFibeEnv();
  const expected = join(directory, 'runtime-data/agent-77/playground');
  expect(new ConfigService().getPlaygroundsDir()).toBe(expected);
  const inherited = execFileSync(
    process.execPath,
    ['-e', 'console.log(process.env.PLAYGROUNDS_DIR)'],
    { cwd: tmpdir(), encoding: 'utf8' },
  ).trim();
  expect(inherited).toBe(expected);
  loadFibeEnv();
  expect(process.env.PLAYGROUNDS_DIR).toBe(expected);
});

test('bootstrap preserves an explicit persistent link directory', () => {
  process.env.PLAYGROUNDS_DIR = 'existing-linked-playground';
  loadFibeEnv();
  expect(process.env.PLAYGROUNDS_DIR).toBe(
    join(directory, 'existing-linked-playground'),
  );
  expect(new ConfigService().getPlaygroundsDir()).toBe(
    process.env.PLAYGROUNDS_DIR,
  );
});

test('bootstrap passes local paths explicitly to Fibe MCP without changing other servers or credentials', () => {
  const docs = { command: 'docs-mcp', env: { TOKEN: 'synthetic-docs' } };
  process.env.FIBE_SETTINGS_JSON = JSON.stringify({
    dataDir: 'runtime-data',
    fibeAgentId: 'agent-77',
    hostRoot: '/custom-host',
    mcpConfig: {
      mcpServers: {
        fibe: {
          command: 'fibe',
          args: ['mcp', 'serve'],
          env: { FIBE_API_KEY: 'synthetic-fibe' },
        },
        docs,
      },
    },
  });
  process.env.HOST_ROOT_DOMAIN = 'fixture.test';
  process.env.HOST_URL_SCHEME = 'http';
  loadFibeEnv();
  const servers = JSON.parse(process.env.MCP_CONFIG_JSON!).mcpServers;
  expect(servers.fibe.env).toEqual({
    FIBE_API_KEY: 'synthetic-fibe',
    PLAYGROUNDS_DIR: join(directory, 'runtime-data/agent-77/playground'),
    HOST_ROOT: '/custom-host',
    HOST_ROOT_DOMAIN: 'fixture.test',
    HOST_URL_SCHEME: 'http',
  });
  expect(servers.docs).toEqual(docs);
  const first = process.env.MCP_CONFIG_JSON;
  loadFibeEnv();
  expect(process.env.MCP_CONFIG_JSON).toBe(first);
});

test('bootstrap preserves explicit MCP path overrides and supports flat manifests', () => {
  process.env.MCP_CONFIG_JSON = JSON.stringify({
    fibe: {
      command: '/usr/local/bin/fibe',
      args: ['mcp', 'serve'],
      env: { PLAYGROUNDS_DIR: '/explicit/mcp', HOST_ROOT: '/explicit/host' },
    },
  });
  loadFibeEnv();
  expect(JSON.parse(process.env.MCP_CONFIG_JSON!).fibe.env).toEqual({
    PLAYGROUNDS_DIR: '/explicit/mcp',
    HOST_ROOT: '/explicit/host',
  });
});

test('bootstrap leaves malformed MCP configuration for the existing writer to diagnose', () => {
  process.env.MCP_CONFIG_JSON = 'invalid-json';
  loadFibeEnv();
  expect(process.env.MCP_CONFIG_JSON).toBe('invalid-json');
});
