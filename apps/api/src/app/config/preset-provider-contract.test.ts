import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMcpConfig } from './mcp-config-writer';

const fixture = JSON.parse(readFileSync(new URL('../../../../../contracts/presets/provider-mcp-v1.json', import.meta.url), 'utf8'));
const variables = ['AGENT_PROVIDER','MCP_CONFIG_JSON','SESSION_DIR','DATA_DIR','FIBE_AGENT_ID','FIBE_PRESET_INPUT_TOKEN','OPENCODE_CONFIG_CONTENT'];
const original = Object.fromEntries(variables.map(name => [name, process.env[name]]));
let directory: string | undefined;
afterEach(() => {
  for (const name of variables) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
});

for (const [provider, value] of Object.entries(fixture.providers)) {
  test(`actual ${provider} writer accepts the Rails-generated preset transport`, () => {
    const row = value as { mcpConfig: unknown; presetEnvironment: Record<string,string> };
    directory = mkdtempSync(join(tmpdir(), 'preset-provider-contract-'));
    process.env.AGENT_PROVIDER = provider;
    process.env.SESSION_DIR = join(directory,'session');
    process.env.DATA_DIR = directory;
    process.env.FIBE_AGENT_ID = 'fixture';
    process.env.FIBE_PRESET_INPUT_TOKEN = row.presetEnvironment.FIBE_PRESET_INPUT_TOKEN;
    process.env.MCP_CONFIG_JSON = JSON.stringify(row.mcpConfig);
    writeMcpConfig();
    if (provider === 'openai-codex') {
      const text = readFileSync(join(directory,'session','config.toml'),'utf8');
      expect(text).toContain('bearer_token_env_var = "FIBE_PRESET_INPUT_TOKEN"');
      expect(text).toContain('http_headers = { "User-Agent" = "Fixture preset" }');
      const remoteBlock = text.split('[mcp_servers."remote_fixture"]')[1];
      expect(remoteBlock).not.toContain('preset-fixture-token');
    } else if (provider === 'opencode') {
      const servers = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT!).mcp;
      expect(servers.remote_fixture.headers.Authorization).toBe('Bearer preset-fixture-token');
      expect(servers.remote_fixture.headers['User-Agent']).toBe('Fixture preset');
      expect(servers.local_fixture.environment.TOKEN).toBe('preset-fixture-token');
    } else {
      const filename = provider === 'antigravity' ? join(directory,'session','config','mcp_config.json') : provider === 'cursor' ? join(directory,'fixture','cursor_workspace','.cursor','mcp.json') : join(directory,'session','settings.json');
      const servers = JSON.parse(readFileSync(filename,'utf8')).mcpServers;
      expect(servers.local_fixture.env.TOKEN).toBe('preset-fixture-token');
      if (provider === 'antigravity') {
        expect(servers.remote_fixture.authHeader).toBe('Bearer preset-fixture-token');
      } else {
        expect(servers.remote_fixture.args).toContain('Authorization:Bearer preset-fixture-token');
        expect(servers.remote_fixture.args).toContain('User-Agent:Fixture preset');
      }
    }
  });
}
