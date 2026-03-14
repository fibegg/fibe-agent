import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeMcpConfig } from './mcp-config-writer';

describe('writeMcpConfig', () => {
  let testHome: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testHome = join(tmpdir(), `mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testHome, { recursive: true });
    process.env.HOME = testHome;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {
      /* cleanup */
    }
  });

  it('does nothing when MCP_CONFIG_JSON is not set', () => {
    delete process.env.MCP_CONFIG_JSON;
    delete process.env.DOCKER_MCP_CONFIG_JSON;
    process.env.AGENT_PROVIDER = 'gemini';
    writeMcpConfig();
    expect(existsSync(join(testHome, '.gemini', 'settings.json'))).toBe(false);
  });

  it('does nothing when AGENT_PROVIDER is not set', () => {
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        'playgrounds-dev': {
          serverUrl: 'https://my.playgrounds.dev',
          authHeader: 'Bearer test123',
        },
      },
    });
    delete process.env.AGENT_PROVIDER;
    writeMcpConfig();
    // No provider directories should be created
    expect(existsSync(join(testHome, '.gemini'))).toBe(false);
    expect(existsSync(join(testHome, '.claude'))).toBe(false);
    expect(existsSync(join(testHome, '.codex'))).toBe(false);
  });

  describe('gemini provider', () => {
    beforeEach(() => {
      process.env.AGENT_PROVIDER = 'gemini';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'playgrounds-dev': {
            serverUrl: 'https://my.playgrounds.dev',
            authHeader: 'Bearer plgr_test_key123',
          },
        },
      });
      delete process.env.DOCKER_MCP_CONFIG_JSON;
    });

    it('writes settings.json with mcpServers block', () => {
      writeMcpConfig();
      const configPath = join(testHome, '.gemini', 'settings.json');
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['playgrounds-dev']).toEqual({
        command: 'npx',
        args: ['-y', 'mcp-remote', 'https://my.playgrounds.dev'],
        env: { AUTHORIZATION: 'Bearer plgr_test_key123' },
      });
    });

    it('preserves existing settings.json content', () => {
      const dir = join(testHome, '.gemini');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'dark' }));

      writeMcpConfig();
      const config = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
      expect(config.theme).toBe('dark');
      expect(config.mcpServers['playgrounds-dev']).toBeDefined();
    });

    it('writes multiple servers from MCP_CONFIG_JSON', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'playgrounds-dev': {
            serverUrl: 'https://my.playgrounds.dev',
            authHeader: 'Bearer plgr_test_key123',
          },
          Sentry: {
            serverUrl: 'https://mcp.sentry.dev/mcp',
          },
        },
      });
      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'),
      );
      expect(config.mcpServers['playgrounds-dev']).toBeDefined();
      expect(config.mcpServers['Sentry']).toEqual({
        command: 'npx',
        args: ['-y', 'mcp-remote', 'https://mcp.sentry.dev/mcp'],
        env: { AUTHORIZATION: '' },
      });
    });

    it('merges DOCKER_MCP_CONFIG_JSON servers', () => {
      process.env.DOCKER_MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          docker: {
            command: 'uvx',
            args: ['mcp-server-docker'],
          },
        },
      });
      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'),
      );
      expect(config.mcpServers['playgrounds-dev']).toBeDefined();
      expect(config.mcpServers['docker']).toEqual({
        command: 'uvx',
        args: ['mcp-server-docker'],
      });
    });

    it('writes stdio server entries as-is', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'playgrounds-dev': {
            serverUrl: 'https://my.playgrounds.dev',
            authHeader: 'Bearer key',
          },
          docker: {
            command: 'uvx',
            args: ['mcp-server-docker'],
          },
        },
      });
      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'),
      );
      expect(config.mcpServers['docker']).toEqual({
        command: 'uvx',
        args: ['mcp-server-docker'],
      });
    });
  });

  describe('claude-code provider', () => {
    beforeEach(() => {
      process.env.AGENT_PROVIDER = 'claude-code';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'playgrounds-dev': {
            serverUrl: 'https://my.playgrounds.dev',
            authHeader: 'Bearer plgr_test_key456',
          },
        },
      });
      delete process.env.DOCKER_MCP_CONFIG_JSON;
    });

    it('writes settings.json with mcpServers block', () => {
      writeMcpConfig();
      const configPath = join(testHome, '.claude', 'settings.json');
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['playgrounds-dev']).toEqual({
        command: 'npx',
        args: ['-y', 'mcp-remote', 'https://my.playgrounds.dev'],
        env: { AUTHORIZATION: 'Bearer plgr_test_key456' },
      });
    });

    it('merges docker and playgrounds servers', () => {
      process.env.DOCKER_MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          docker: { command: 'uvx', args: ['mcp-server-docker'] },
        },
      });
      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(testHome, '.claude', 'settings.json'), 'utf8'),
      );
      expect(Object.keys(config.mcpServers)).toContain('playgrounds-dev');
      expect(Object.keys(config.mcpServers)).toContain('docker');
    });
  });

  describe('openai-codex provider', () => {
    beforeEach(() => {
      process.env.AGENT_PROVIDER = 'openai-codex';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'playgrounds-dev': {
            serverUrl: 'https://my.playgrounds.dev',
            authHeader: 'Bearer plgr_test_key789',
          },
        },
      });
      delete process.env.DOCKER_MCP_CONFIG_JSON;
    });

    it('writes config.toml with mcp_servers block', () => {
      writeMcpConfig();
      const configPath = join(testHome, '.codex', 'config.toml');
      expect(existsSync(configPath)).toBe(true);
      const content = readFileSync(configPath, 'utf8');
      expect(content).toContain('[mcp_servers."playgrounds-dev"]');
      expect(content).toContain('url = "https://my.playgrounds.dev"');
      expect(content).toContain('AUTHORIZATION = "Bearer plgr_test_key789"');
    });

    it('preserves existing config.toml content', () => {
      const dir = join(testHome, '.codex');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.toml'), 'model = "gpt-4"\n');

      writeMcpConfig();
      const content = readFileSync(join(dir, 'config.toml'), 'utf8');
      expect(content).toContain('model = "gpt-4"');
      expect(content).toContain('[mcp_servers."playgrounds-dev"]');
    });

    it('writes stdio servers as type = stdio in toml', () => {
      process.env.DOCKER_MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          docker: { command: 'uvx', args: ['mcp-server-docker'] },
        },
      });
      writeMcpConfig();
      const content = readFileSync(join(testHome, '.codex', 'config.toml'), 'utf8');
      expect(content).toContain('[mcp_servers."docker"]');
      expect(content).toContain('type = "stdio"');
      expect(content).toContain('command = "uvx"');
      expect(content).toContain('args = ["mcp-server-docker"]');
    });
  });

  describe('legacy format support', () => {
    it('handles legacy flat { serverUrl, authHeader } format', () => {
      process.env.AGENT_PROVIDER = 'gemini';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        serverUrl: 'https://my.playgrounds.dev',
        authHeader: 'Bearer legacy_key',
      });
      delete process.env.DOCKER_MCP_CONFIG_JSON;
      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'),
      );
      expect(config.mcpServers['playgrounds-dev']).toEqual({
        command: 'npx',
        args: ['-y', 'mcp-remote', 'https://my.playgrounds.dev'],
        env: { AUTHORIZATION: 'Bearer legacy_key' },
      });
    });
  });

  it('handles invalid JSON gracefully', () => {
    process.env.AGENT_PROVIDER = 'gemini';
    process.env.MCP_CONFIG_JSON = 'not-json';
    delete process.env.DOCKER_MCP_CONFIG_JSON;
    expect(() => writeMcpConfig()).not.toThrow();
  });

  it('warns for unknown provider', () => {
    process.env.AGENT_PROVIDER = 'unknown-provider';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        'playgrounds-dev': {
          serverUrl: 'https://my.playgrounds.dev',
          authHeader: 'Bearer test',
        },
      },
    });
    delete process.env.DOCKER_MCP_CONFIG_JSON;
    expect(() => writeMcpConfig()).not.toThrow();
  });
});
