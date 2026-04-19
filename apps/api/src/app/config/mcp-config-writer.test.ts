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
        'fibe': {
          serverUrl: 'https://fibe.gg',
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
          'fibe': {
            serverUrl: 'https://fibe.gg',
            authHeader: 'Bearer fibe_test_key123',
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
      expect(config.mcpServers['fibe']).toEqual({
        command: 'mcp-remote-wrapper',
        args: ['https://fibe.gg', '--header', 'Authorization:Bearer fibe_test_key123'],
      });
    });

    it('preserves existing settings.json content', () => {
      const dir = join(testHome, '.gemini');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'dark' }));

      writeMcpConfig();
      const config = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
      expect(config.theme).toBe('dark');
      expect(config.mcpServers['fibe']).toBeDefined();
    });

    it('writes multiple servers from MCP_CONFIG_JSON', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'fibe': {
            serverUrl: 'https://fibe.gg',
            authHeader: 'Bearer fibe_test_key123',
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
      expect(config.mcpServers['fibe']).toBeDefined();
      expect(config.mcpServers['Sentry']).toEqual({
        command: 'mcp-remote-wrapper',
        args: ['https://mcp.sentry.dev/mcp'],
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
      expect(config.mcpServers['fibe']).toBeDefined();
      expect(config.mcpServers['docker']).toEqual({
        command: 'uvx',
        args: ['mcp-server-docker'],
      });
    });

    it('writes stdio server entries as-is', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'fibe': {
            serverUrl: 'https://fibe.gg',
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

    it('includes --allow-http flag for non-HTTPS server URLs', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'local-dev': {
            serverUrl: 'http://rails.test:3000/mcp',
            authHeader: 'Bearer dev_key',
          },
        },
      });
      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'),
      );
      expect(config.mcpServers['local-dev']).toEqual({
        command: 'mcp-remote-wrapper',
        args: ['http://rails.test:3000/mcp', '--allow-http', '--header', 'Authorization:Bearer dev_key'],
      });
    });

    it('does NOT include --allow-http for HTTPS server URLs', () => {
      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'),
      );
      // Default setup uses https://fibe.gg
      expect(config.mcpServers['fibe'].args).not.toContain('--allow-http');
    });
  });

  describe('claude-code provider', () => {
    beforeEach(() => {
      process.env.AGENT_PROVIDER = 'claude-code';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'fibe': {
            serverUrl: 'https://fibe.gg',
            authHeader: 'Bearer fibe_test_key456',
          },
        },
      });
      delete process.env.DOCKER_MCP_CONFIG_JSON;
    });

    it('writes .claude.json with mcpServers block', () => {
      writeMcpConfig();
      const configPath = join(testHome, '.claude.json');
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['fibe']).toEqual({
        command: 'mcp-remote-wrapper',
        args: ['https://fibe.gg', '--header', 'Authorization:Bearer fibe_test_key456'],
      });
    });

    it('writes ~/.claude/settings.json with mcpServers block', () => {
      writeMcpConfig();
      const settingsPath = join(testHome, '.claude', 'settings.json');
      expect(existsSync(settingsPath)).toBe(true);
      const config = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(config.mcpServers['fibe']).toEqual({
        command: 'mcp-remote-wrapper',
        args: ['https://fibe.gg', '--header', 'Authorization:Bearer fibe_test_key456'],
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
        readFileSync(join(testHome, '.claude.json'), 'utf8'),
      );
      expect(Object.keys(config.mcpServers)).toContain('fibe');
      expect(Object.keys(config.mcpServers)).toContain('docker');
    });

    it('preserves existing .claude.json content', () => {
      writeFileSync(join(testHome, '.claude.json'), JSON.stringify({ userID: 'abc123', firstStartTime: '2026-01-01' }));

      writeMcpConfig();
      const config = JSON.parse(readFileSync(join(testHome, '.claude.json'), 'utf8'));
      expect(config.userID).toBe('abc123');
      expect(config.firstStartTime).toBe('2026-01-01');
      expect(config.mcpServers['fibe']).toBeDefined();
    });
  });

  describe('openai-codex provider', () => {
    beforeEach(() => {
      process.env.AGENT_PROVIDER = 'openai-codex';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'fibe': {
            serverUrl: 'https://fibe.gg',
            authHeader: 'Bearer fibe_test_key789',
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
      expect(content).toContain('[mcp_servers."fibe"]');
      expect(content).toContain('url = "https://fibe.gg"');
    });

    it('writes bearer_token_env_var for remote servers when configured explicitly', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'fibe': {
            serverUrl: 'https://fibe.gg',
            bearerTokenEnvVar: 'FIBE_API_KEY',
          },
        },
      });

      writeMcpConfig();

      const content = readFileSync(join(testHome, '.codex', 'config.toml'), 'utf8');
      expect(content).toContain('bearer_token_env_var = "FIBE_API_KEY"');
    });

    it('derives bearer_token_env_var from authHeader env placeholders', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          'fibe': {
            serverUrl: 'https://fibe.gg',
            authHeader: 'Bearer ${env:FIBE_API_KEY}',
          },
        },
      });

      writeMcpConfig();

      const content = readFileSync(join(testHome, '.codex', 'config.toml'), 'utf8');
      expect(content).toContain('bearer_token_env_var = "FIBE_API_KEY"');
    });

    it('preserves existing config.toml content', () => {
      const dir = join(testHome, '.codex');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.toml'), 'model = "gpt-4"\n');

      writeMcpConfig();
      const content = readFileSync(join(dir, 'config.toml'), 'utf8');
      expect(content).toContain('model = "gpt-4"');
      expect(content).toContain('[mcp_servers."fibe"]');
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

    it('replacing block with args array does not corrupt toml', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
        },
      });
      writeMcpConfig();
      const contentAfterFirst = readFileSync(join(testHome, '.codex', 'config.toml'), 'utf8');
      expect(contentAfterFirst).toContain('args = ["-y", "@modelcontextprotocol/server-github"]');
      writeMcpConfig();
      const contentAfterSecond = readFileSync(join(testHome, '.codex', 'config.toml'), 'utf8');
      expect(contentAfterSecond).not.toMatch(/^\s*\]\s*$/m);
      expect(contentAfterSecond).toContain('[mcp_servers."github"]');
    });

    it('writes stdio server with env vars in toml', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_token123' },
          },
        },
      });
      writeMcpConfig();
      const content = readFileSync(join(testHome, '.codex', 'config.toml'), 'utf8');
      expect(content).toContain('[mcp_servers."github"]');
      expect(content).toContain('type = "stdio"');
      expect(content).toContain('env = { GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_token123" }');
    });
  });

  describe('cursor provider', () => {
    beforeEach(() => {
      process.env.AGENT_PROVIDER = 'cursor';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          fibe: {
            command: 'fibe',
            args: ['mcp', 'serve', '--tools', 'full', '--yolo'],
            env: { FIBE_API_KEY: 'fibe_test_key' },
          },
        },
      });
      process.env.DOCKER_MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          docker: { command: 'uvx', args: ['mcp-server-docker'] },
        },
      });
      delete process.env.SESSION_DIR;
      delete process.env.DATA_DIR;
      delete process.env.FIBE_AGENT_ID;
      delete process.env.CONVERSATION_ID;
    });

    it('writes workspace .cursor/mcp.json when FIBE_AGENT_ID is available', () => {
      process.env.DATA_DIR = join(testHome, 'data');
      process.env.FIBE_AGENT_ID = 'agent/123';

      writeMcpConfig();

      const configPath = join(testHome, 'data', 'agent_123', 'cursor_workspace', '.cursor', 'mcp.json');
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['fibe']).toEqual({
        command: 'fibe',
        args: ['mcp', 'serve', '--tools', 'full', '--yolo'],
        env: { FIBE_API_KEY: 'fibe_test_key' },
      });
      expect(config.mcpServers['docker']).toEqual({
        command: 'uvx',
        args: ['mcp-server-docker'],
      });
    });

    it('falls back to SESSION_DIR/mcp.json without a conversation id', () => {
      process.env.SESSION_DIR = join(testHome, '.cursor-session');

      writeMcpConfig();

      const configPath = join(testHome, '.cursor-session', 'mcp.json');
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['fibe']).toBeDefined();
    });

    it('writes remote MCP servers via mcp-remote-wrapper', () => {
      process.env.DATA_DIR = join(testHome, 'data');
      process.env.FIBE_AGENT_ID = 'agent-remote';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          remote: {
            serverUrl: 'http://rails.test:3000/mcp',
            authHeader: 'Bearer cursor_key',
          },
        },
      });
      delete process.env.DOCKER_MCP_CONFIG_JSON;

      writeMcpConfig();

      const config = JSON.parse(
        readFileSync(join(testHome, 'data', 'agent-remote', 'cursor_workspace', '.cursor', 'mcp.json'), 'utf8'),
      );
      expect(config.mcpServers['remote']).toEqual({
        command: 'mcp-remote-wrapper',
        args: ['http://rails.test:3000/mcp', '--allow-http', '--header', 'Authorization:Bearer cursor_key'],
      });
    });

    it('preserves existing cursor mcp.json content', () => {
      process.env.DATA_DIR = join(testHome, 'data');
      process.env.FIBE_AGENT_ID = 'agent-merge';
      const dir = join(testHome, 'data', 'agent-merge', 'cursor_workspace', '.cursor');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'mcp.json'), JSON.stringify({
        mcpServers: { existing: { command: 'node', args: ['server.js'] } },
        ui: { theme: 'dark' },
      }));

      writeMcpConfig();

      const config = JSON.parse(readFileSync(join(dir, 'mcp.json'), 'utf8'));
      expect(config.ui).toEqual({ theme: 'dark' });
      expect(config.mcpServers['existing']).toEqual({ command: 'node', args: ['server.js'] });
      expect(config.mcpServers['fibe']).toBeDefined();
      expect(config.mcpServers['docker']).toBeDefined();
    });
  });

  describe('legacy format support', () => {
    it('handles legacy flat { serverUrl, authHeader } format', () => {
      process.env.AGENT_PROVIDER = 'gemini';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        serverUrl: 'https://fibe.gg',
        authHeader: 'Bearer legacy_key',
      });
      delete process.env.DOCKER_MCP_CONFIG_JSON;
      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'),
      );
      expect(config.mcpServers['fibe']).toEqual({
        command: 'mcp-remote-wrapper',
        args: ['https://fibe.gg', '--header', 'Authorization:Bearer legacy_key'],
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
        'fibe': {
          serverUrl: 'https://fibe.gg',
          authHeader: 'Bearer test',
        },
      },
    });
    delete process.env.DOCKER_MCP_CONFIG_JSON;
    expect(() => writeMcpConfig()).not.toThrow();
  });

  it('opencode writer mutates process.env.OPENCODE_CONFIG_CONTENT globally', () => {
    process.env.AGENT_PROVIDER = 'opencode';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        'test-server': { serverUrl: 'https://example.com/mcp' },
      },
    });
    delete process.env.DOCKER_MCP_CONFIG_JSON;

    writeMcpConfig();

    expect(process.env.OPENCODE_CONFIG_CONTENT).toBeDefined();
    const configContent = process.env.OPENCODE_CONFIG_CONTENT ?? '{}';
    const config = JSON.parse(configContent);
    expect(config.mcpServers['test-server']).toBeDefined();
    expect(config.mcpServers['test-server'].url).toBe('https://example.com/mcp');
  });

  it('normalizes provider name with underscores to hyphens', () => {
    process.env.AGENT_PROVIDER = 'claude_code';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        'test-server': { serverUrl: 'https://example.com/mcp', authHeader: 'Bearer tok' },
      },
    });
    delete process.env.DOCKER_MCP_CONFIG_JSON;
    delete process.env.SESSION_DIR;

    writeMcpConfig();

    const settingsPath = join(testHome, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
  });

  it('merges DOCKER_MCP_CONFIG_JSON with MCP_CONFIG_JSON', () => {
    process.env.AGENT_PROVIDER = 'gemini';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: { 'server-a': { serverUrl: 'https://a.com' } },
    });
    process.env.DOCKER_MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: { 'server-b': { serverUrl: 'https://b.com' } },
    });
    delete process.env.SESSION_DIR;

    writeMcpConfig();

    const config = JSON.parse(readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'));
    expect(config.mcpServers['server-a']).toBeDefined();
    expect(config.mcpServers['server-b']).toBeDefined();
  });

  it('handles malformed MCP_CONFIG_JSON gracefully', () => {
    process.env.AGENT_PROVIDER = 'gemini';
    process.env.MCP_CONFIG_JSON = 'not-valid-json{{{';
    delete process.env.DOCKER_MCP_CONFIG_JSON;
    delete process.env.SESSION_DIR;

    expect(() => writeMcpConfig()).not.toThrow();
  });

  it('escapes server args containing double quotes in TOML output', () => {
    process.env.AGENT_PROVIDER = 'openai-codex';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        'test-server': {
          command: 'node',
          args: ['script.js', 'arg with "quotes"'],
        },
      },
    });
    delete process.env.DOCKER_MCP_CONFIG_JSON;
    delete process.env.SESSION_DIR;

    writeMcpConfig();

    const configPath = join(testHome, '.codex', 'config.toml');
    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, 'utf8');
    expect(content).toContain('test-server');
    expect(content).toContain('args = ["script.js", "arg with \\"quotes\\""]');
  });

  it('TOML writer preserves existing non-MCP sections', () => {
    process.env.AGENT_PROVIDER = 'openai-codex';
    delete process.env.DOCKER_MCP_CONFIG_JSON;
    delete process.env.SESSION_DIR;

    const codexDir = join(testHome, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, 'config.toml'), [
      '[mcp_servers."old-server"]',
      'url = "https://old.com"',
      '',
      '[general]',
      'model = "gpt-4"',
      '',
    ].join('\n'));

    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        'old-server': { serverUrl: 'https://new.com' },
      },
    });

    writeMcpConfig();

    const content = readFileSync(join(codexDir, 'config.toml'), 'utf8');
    expect(content).toContain('[general]');
    expect(content).toContain('model = "gpt-4"');
  });

  it('claude-code writer writes to both settings.json and legacy .claude.json', () => {
    process.env.AGENT_PROVIDER = 'claude-code';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: { 'test': { serverUrl: 'https://test.com' } },
    });
    delete process.env.DOCKER_MCP_CONFIG_JSON;
    delete process.env.SESSION_DIR;

    writeMcpConfig();

    const settingsPath = join(testHome, '.claude', 'settings.json');
    const legacyPath = join(testHome, '.claude.json');
    expect(existsSync(settingsPath)).toBe(true);
    expect(existsSync(legacyPath)).toBe(true);
  });
});
