import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeMcpConfig } from './mcp-config-writer';

describe('writeMcpConfig', () => {
  let testHome: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
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
    process.env.AGENT_PROVIDER = 'gemini';
    writeMcpConfig();
    expect(existsSync(join(testHome, '.gemini', 'settings.json'))).toBe(false);
  });

  it('defaults to claude-code provider when AGENT_PROVIDER is not set', () => {
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        fibe: {
          serverUrl: 'https://fibe.gg',
          authHeader: 'Bearer test123',
        },
      },
    });
    delete process.env.AGENT_PROVIDER;
    writeMcpConfig();
    expect(existsSync(join(testHome, '.claude'))).toBe(true);
    expect(existsSync(join(testHome, '.gemini'))).toBe(false);
    expect(existsSync(join(testHome, '.codex'))).toBe(false);
  });

  describe('gemini provider', () => {
    beforeEach(() => {
      process.env.AGENT_PROVIDER = 'gemini';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          fibe: {
            serverUrl: 'https://fibe.gg',
            authHeader: 'Bearer fibe_test_key123',
          },
        },
      });
    });

    it('writes settings.json with mcpServers block', () => {
      writeMcpConfig();
      const configPath = join(testHome, '.gemini', 'settings.json');
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['fibe']).toEqual({
        command: 'mcp-remote-wrapper',
        args: [
          'https://fibe.gg',
          '--header',
          'Authorization:Bearer fibe_test_key123',
        ],
      });
    });

    it('preserves existing settings.json content', () => {
      const dir = join(testHome, '.gemini');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'settings.json'),
        JSON.stringify({ theme: 'dark' }),
      );

      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(dir, 'settings.json'), 'utf8'),
      );
      expect(config.theme).toBe('dark');
      expect(config.mcpServers['fibe']).toBeDefined();
    });

    it('writes multiple servers from MCP_CONFIG_JSON', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          fibe: {
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

    it('merges extraServers over MCP_CONFIG_JSON servers', () => {
      writeMcpConfig({
        docker: { command: 'uvx', args: ['mcp-server-docker'] },
      });
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
          fibe: {
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
            serverUrl: 'http://fibe.test/mcp',
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
        args: [
          'http://fibe.test/mcp',
          '--allow-http',
          '--header',
          'Authorization:Bearer dev_key',
        ],
      });
    });

    it('does NOT include --allow-http for HTTPS server URLs', () => {
      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'),
      );
      expect(config.mcpServers['fibe'].args).not.toContain('--allow-http');
    });
  });

  describe('antigravity provider', () => {
    beforeEach(() => {
      process.env.AGENT_PROVIDER = 'antigravity';
      process.env.SESSION_DIR = join(testHome, '.gemini');
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          fibe: {
            command: 'fibe',
            args: ['mcp', 'serve', '--tools', 'core', '--yolo'],
            env: {
              FIBE_API_KEY: 'fibe_test_key',
              FIBE_DOMAIN: 'http://rails.test:3000',
            },
          },
          Sentry: {
            serverUrl: 'https://mcp.sentry.dev/mcp',
          },
        },
      });
    });

    it('writes Antigravity mcp_config.json under the session config directory', () => {
      writeMcpConfig();

      const configPath = join(testHome, '.gemini', 'config', 'mcp_config.json');
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['fibe']).toEqual({
        command: 'fibe',
        args: ['mcp', 'serve', '--tools', 'core', '--yolo'],
        env: {
          FIBE_API_KEY: 'fibe_test_key',
          FIBE_DOMAIN: 'http://rails.test:3000',
        },
      });
      expect(config.mcpServers['Sentry']).toEqual({
        serverUrl: 'https://mcp.sentry.dev/mcp',
      });
    });

    it('replaces an empty file injected from stored OAuth credentials', () => {
      const configDir = join(testHome, '.gemini', 'config');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'mcp_config.json'), '');

      writeMcpConfig({
        docker: { command: 'uvx', args: ['mcp-server-docker'] },
      });

      const config = JSON.parse(
        readFileSync(join(configDir, 'mcp_config.json'), 'utf8'),
      );
      expect(config.mcpServers['fibe']).toBeDefined();
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
          fibe: {
            serverUrl: 'https://fibe.gg',
            authHeader: 'Bearer fibe_test_key456',
          },
        },
      });
    });

    it('writes ~/.claude/settings.json with mcpServers block', () => {
      writeMcpConfig();
      const settingsPath = join(testHome, '.claude', 'settings.json');
      expect(existsSync(settingsPath)).toBe(true);
      const config = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(config.mcpServers['fibe']).toEqual({
        command: 'mcp-remote-wrapper',
        args: [
          'https://fibe.gg',
          '--header',
          'Authorization:Bearer fibe_test_key456',
        ],
      });
    });

    it('merges extraServers into claude settings.json', () => {
      writeMcpConfig({
        docker: { command: 'uvx', args: ['mcp-server-docker'] },
      });
      const config = JSON.parse(
        readFileSync(join(testHome, '.claude', 'settings.json'), 'utf8'),
      );
      expect(Object.keys(config.mcpServers)).toContain('fibe');
      expect(Object.keys(config.mcpServers)).toContain('docker');
    });

    it('preserves existing ~/.claude/settings.json content', () => {
      const claudeDir = join(testHome, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, 'settings.json'),
        JSON.stringify({ theme: 'dark' }),
      );

      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(claudeDir, 'settings.json'), 'utf8'),
      );
      expect(config.theme).toBe('dark');
      expect(config.mcpServers['fibe']).toBeDefined();
    });

    it('writes project .mcp.json with stdio type when FIBE_AGENT_ID is available', () => {
      process.env.DATA_DIR = join(testHome, 'data');
      process.env.FIBE_AGENT_ID = 'agent/claude';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          fibe: {
            command: 'fibe',
            args: ['mcp', 'serve', '--tools', 'core', '--yolo'],
            env: { FIBE_API_KEY: 'fibe_test_key' },
          },
        },
      });

      writeMcpConfig();

      const configPath = join(
        testHome,
        'data',
        'agent_claude',
        'claude_workspace',
        '.mcp.json',
      );
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['fibe']).toEqual({
        type: 'stdio',
        command: 'fibe',
        args: ['mcp', 'serve', '--tools', 'core', '--yolo'],
        env: { FIBE_API_KEY: 'fibe_test_key' },
      });
    });
  });

  describe('openai-codex provider', () => {
    beforeEach(() => {
      process.env.AGENT_PROVIDER = 'openai-codex';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          fibe: {
            serverUrl: 'https://fibe.gg',
            authHeader: 'Bearer fibe_test_key789',
          },
        },
      });
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
          fibe: {
            serverUrl: 'https://fibe.gg',
            bearerTokenEnvVar: 'FIBE_API_KEY',
          },
        },
      });

      writeMcpConfig();

      const content = readFileSync(
        join(testHome, '.codex', 'config.toml'),
        'utf8',
      );
      expect(content).toContain('bearer_token_env_var = "FIBE_API_KEY"');
    });

    it('derives bearer_token_env_var from authHeader env placeholders', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          fibe: {
            serverUrl: 'https://fibe.gg',
            authHeader: 'Bearer ${env:FIBE_API_KEY}',
          },
        },
      });

      writeMcpConfig();

      const content = readFileSync(
        join(testHome, '.codex', 'config.toml'),
        'utf8',
      );
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
      writeMcpConfig({
        docker: { command: 'uvx', args: ['mcp-server-docker'] },
      });
      const content = readFileSync(
        join(testHome, '.codex', 'config.toml'),
        'utf8',
      );
      expect(content).toContain('[mcp_servers."docker"]');
      expect(content).toContain('type = "stdio"');
      expect(content).toContain('command = "uvx"');
      expect(content).toContain('args = ["mcp-server-docker"]');
    });

    it('replacing block with args array does not corrupt toml', () => {
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
          },
        },
      });
      writeMcpConfig();
      const contentAfterFirst = readFileSync(
        join(testHome, '.codex', 'config.toml'),
        'utf8',
      );
      expect(contentAfterFirst).toContain(
        'args = ["-y", "@modelcontextprotocol/server-github"]',
      );
      writeMcpConfig();
      const contentAfterSecond = readFileSync(
        join(testHome, '.codex', 'config.toml'),
        'utf8',
      );
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
      const content = readFileSync(
        join(testHome, '.codex', 'config.toml'),
        'utf8',
      );
      expect(content).toContain('[mcp_servers."github"]');
      expect(content).toContain('type = "stdio"');
      expect(content).toContain(
        'env = { GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_token123" }',
      );
    });
  });

  describe('cursor provider', () => {
    beforeEach(() => {
      process.env.AGENT_PROVIDER = 'cursor';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: {
          fibe: {
            command: 'fibe',
            args: ['mcp', 'serve', '--tools', 'core', '--yolo'],
            env: { FIBE_API_KEY: 'fibe_test_key' },
          },
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

      const configPath = join(
        testHome,
        'data',
        'agent_123',
        'cursor_workspace',
        '.cursor',
        'mcp.json',
      );
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['fibe']).toEqual({
        command: 'fibe',
        args: ['mcp', 'serve', '--tools', 'core', '--yolo'],
        env: { FIBE_API_KEY: 'fibe_test_key' },
      });
    });

    it('falls back to SESSION_DIR/mcp.json without a conversation id', () => {
      process.env.SESSION_DIR = join(testHome, '.cursor-session');
      delete process.env.DATA_DIR;
      delete process.env.FIBE_AGENT_ID;
      delete process.env.CONVERSATION_ID;

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
            serverUrl: 'http://fibe.test/mcp',
            authHeader: 'Bearer cursor_key',
          },
        },
      });

      writeMcpConfig();

      const config = JSON.parse(
        readFileSync(
          join(
            testHome,
            'data',
            'agent-remote',
            'cursor_workspace',
            '.cursor',
            'mcp.json',
          ),
          'utf8',
        ),
      );
      expect(config.mcpServers['remote']).toEqual({
        command: 'mcp-remote-wrapper',
        args: [
          'http://fibe.test/mcp',
          '--allow-http',
          '--header',
          'Authorization:Bearer cursor_key',
        ],
      });
    });

    it('preserves existing cursor mcp.json content', () => {
      process.env.DATA_DIR = join(testHome, 'data');
      process.env.FIBE_AGENT_ID = 'agent-merge';
      const dir = join(
        testHome,
        'data',
        'agent-merge',
        'cursor_workspace',
        '.cursor',
      );
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'mcp.json'),
        JSON.stringify({
          mcpServers: { existing: { command: 'node', args: ['server.js'] } },
          ui: { theme: 'dark' },
        }),
      );

      writeMcpConfig();

      const config = JSON.parse(readFileSync(join(dir, 'mcp.json'), 'utf8'));
      expect(config.ui).toEqual({ theme: 'dark' });
      expect(config.mcpServers['existing']).toEqual({
        command: 'node',
        args: ['server.js'],
      });
      expect(config.mcpServers['fibe']).toBeDefined();
    });
  });

  describe('legacy format support', () => {
    it('handles legacy flat { serverUrl, authHeader } format', () => {
      process.env.AGENT_PROVIDER = 'gemini';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        serverUrl: 'https://fibe.gg',
        authHeader: 'Bearer legacy_key',
      });
      writeMcpConfig();
      const config = JSON.parse(
        readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'),
      );
      expect(config.mcpServers['fibe']).toEqual({
        command: 'mcp-remote-wrapper',
        args: [
          'https://fibe.gg',
          '--header',
          'Authorization:Bearer legacy_key',
        ],
      });
    });
  });

  it('handles invalid JSON gracefully', () => {
    process.env.AGENT_PROVIDER = 'gemini';
    process.env.MCP_CONFIG_JSON = 'not-json';
    expect(() => writeMcpConfig()).not.toThrow();
  });

  it('warns for unknown provider', () => {
    process.env.AGENT_PROVIDER = 'unknown-provider';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        fibe: {
          serverUrl: 'https://fibe.gg',
          authHeader: 'Bearer test',
        },
      },
    });
    expect(() => writeMcpConfig()).not.toThrow();
  });

  it('opencode writer emits current local stdio MCP schema and preserves existing config', () => {
    process.env.AGENT_PROVIDER = 'opencode';
    process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
      permission: 'ask',
      share: 'manual',
      provider: {
        openai: {
          options: {
            baseURL: 'https://llm.example.test/v1',
          },
        },
      },
    });
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        fibe: {
          command: 'fibe',
          args: ['mcp', 'serve', '--tools', 'core', '--yolo'],
          env: {
            FIBE_API_KEY: 'fibe-key',
            FIBE_DOMAIN: 'http://rails.test:3000',
          },
        },
      },
    });

    writeMcpConfig();

    expect(process.env.OPENCODE_CONFIG_CONTENT).toBeDefined();
    const configContent = process.env.OPENCODE_CONFIG_CONTENT ?? '{}';
    const config = JSON.parse(configContent);
    expect(config.permission).toBe('ask');
    expect(config.share).toBe('manual');
    expect(config.provider.openai.options.baseURL).toBe(
      'https://llm.example.test/v1',
    );
    expect(config.mcp['fibe']).toEqual({
      type: 'local',
      enabled: true,
      command: ['fibe', 'mcp', 'serve', '--tools', 'core', '--yolo'],
      environment: {
        FIBE_API_KEY: 'fibe-key',
        FIBE_DOMAIN: 'http://rails.test:3000',
      },
    });
    expect(config.mcp['fibe'].args).toBeUndefined();
    expect(config.mcp['fibe'].env).toBeUndefined();
  });

  it('opencode writer emits remote MCP headers for raw and env-backed auth', () => {
    process.env.AGENT_PROVIDER = 'opencode';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        'raw-auth': {
          serverUrl: 'https://raw.example.test/mcp',
          authHeader: 'Bearer raw-token',
        },
        'explicit-env': {
          serverUrl: 'https://env.example.test/mcp',
          bearerTokenEnvVar: 'MCP_TOKEN',
        },
        'legacy-env-placeholder': {
          serverUrl: 'https://legacy-env.example.test/mcp',
          authHeader: 'Bearer ${env:LEGACY_TOKEN}',
        },
        'legacy-raw-placeholder': {
          serverUrl: 'https://legacy-raw.example.test/mcp',
          authHeader: 'Bearer ${RAW_TOKEN}',
        },
      },
    });

    writeMcpConfig();

    const config = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT ?? '{}');
    expect(config.mcp['raw-auth']).toEqual({
      type: 'remote',
      enabled: true,
      url: 'https://raw.example.test/mcp',
      headers: { Authorization: 'Bearer raw-token' },
    });
    expect(config.mcp['explicit-env']).toEqual({
      type: 'remote',
      enabled: true,
      url: 'https://env.example.test/mcp',
      headers: { Authorization: 'Bearer {env:MCP_TOKEN}' },
    });
    expect(config.mcp['legacy-env-placeholder'].headers.Authorization).toBe(
      'Bearer {env:LEGACY_TOKEN}',
    );
    expect(config.mcp['legacy-raw-placeholder'].headers.Authorization).toBe(
      'Bearer {env:RAW_TOKEN}',
    );
  });

  it('normalizes provider name with underscores to hyphens', () => {
    process.env.AGENT_PROVIDER = 'claude_code';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        'test-server': {
          serverUrl: 'https://example.com/mcp',
          authHeader: 'Bearer tok',
        },
      },
    });
    delete process.env.SESSION_DIR;

    writeMcpConfig();

    const settingsPath = join(testHome, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
  });

  it('merges extraServers with MCP_CONFIG_JSON', () => {
    process.env.AGENT_PROVIDER = 'gemini';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: { 'server-a': { serverUrl: 'https://a.com' } },
    });

    writeMcpConfig({ 'server-b': { serverUrl: 'https://b.com' } });

    const config = JSON.parse(
      readFileSync(join(testHome, '.gemini', 'settings.json'), 'utf8'),
    );
    expect(config.mcpServers['server-a']).toBeDefined();
    expect(config.mcpServers['server-b']).toBeDefined();
  });

  it('handles malformed MCP_CONFIG_JSON gracefully', () => {
    process.env.AGENT_PROVIDER = 'gemini';
    process.env.MCP_CONFIG_JSON = 'not-valid-json{{{';
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
    delete process.env.SESSION_DIR;

    const codexDir = join(testHome, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(
      join(codexDir, 'config.toml'),
      [
        '[mcp_servers."old-server"]',
        'url = "https://old.com"',
        '',
        '[general]',
        'model = "gpt-4"',
        '',
      ].join('\n'),
    );

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

  it('claude-code writer writes to project .mcp.json and ~/.claude/settings.json', () => {
    process.env.AGENT_PROVIDER = 'claude-code';
    process.env.DATA_DIR = join(testHome, 'data');
    process.env.FIBE_AGENT_ID = 'agent-three-paths';
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: { test: { serverUrl: 'https://test.com' } },
    });
    delete process.env.SESSION_DIR;

    writeMcpConfig();

    const settingsPath = join(testHome, '.claude', 'settings.json');
    const projectPath = join(
      testHome,
      'data',
      'agent-three-paths',
      'claude_workspace',
      '.mcp.json',
    );
    expect(existsSync(settingsPath)).toBe(true);
    expect(existsSync(projectPath)).toBe(true);
  });

  describe('retiring built-in credentials from persisted runtime config', () => {
    const builtinServers = {
      github: {
        command: 'mcp-github',
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'old-github' },
      },
      gitea: { command: 'gitea-mcp', env: { GITEA_ACCESS_TOKEN: 'old-gitea' } },
      fibe: { command: 'fibe', env: { FIBE_API_KEY: 'old-fibe' } },
      fibe_sdk_custom: { command: 'custom-tool' },
    };

    for (const [provider, relativePath] of [
      ['gemini', 'settings.json'],
      ['antigravity', 'config/mcp_config.json'],
      ['claude-code', 'settings.json'],
      ['openai-codex', 'config.toml'],
      ['cursor', 'mcp.json'],
    ]) {
      it(`removes retired reserved credentials for ${provider} while preserving custom entries`, () => {
        process.env.AGENT_PROVIDER = provider;
        process.env.SESSION_DIR = testHome;
        process.env.DATA_DIR = testHome;
        delete process.env.FIBE_AGENT_ID;
        delete process.env.CONVERSATION_ID;
        process.env.MCP_CONFIG_JSON = JSON.stringify({
          mcpServers: builtinServers,
        });
        writeMcpConfig();
        // Custom on-volume entries remain useful; only known reserved names are managed here.
        process.env.MCP_CONFIG_JSON = JSON.stringify({ mcpServers: {} });
        writeMcpConfig();
        const output = readFileSync(join(testHome, relativePath), 'utf8');
        expect(output).not.toContain('old-github');
        expect(output).not.toContain('old-gitea');
        expect(output).not.toContain('old-fibe');
        expect(output).toContain('custom-tool');
        if (provider === 'claude-code') {
          const project = readFileSync(
            join(testHome, 'default/claude_workspace/.mcp.json'),
            'utf8',
          );
          expect(project).not.toContain('old-github');
          expect(project).not.toContain('old-gitea');
          expect(project).not.toContain('old-fibe');
        }
      });
    }

    it('removes retired credentials from OpenCode merged environment config', () => {
      process.env.AGENT_PROVIDER = 'opencode';
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: builtinServers,
      });
      writeMcpConfig();
      process.env.MCP_CONFIG_JSON = JSON.stringify({ mcpServers: {} });
      writeMcpConfig();
      expect(process.env.OPENCODE_CONFIG_CONTENT).not.toContain('old-github');
      expect(process.env.OPENCODE_CONFIG_CONTENT).not.toContain('old-gitea');
      expect(process.env.OPENCODE_CONFIG_CONTENT).not.toContain('old-fibe');
      expect(process.env.OPENCODE_CONFIG_CONTENT).toContain('custom-tool');
    });

    it('preserves on-volume configuration when there is no full manifest', () => {
      process.env.AGENT_PROVIDER = 'gemini';
      process.env.SESSION_DIR = testHome;
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        mcpServers: builtinServers,
      });
      writeMcpConfig();
      delete process.env.MCP_CONFIG_JSON;
      writeMcpConfig({ sentry: { command: 'sentry' } });
      expect(readFileSync(join(testHome, 'settings.json'), 'utf8')).toContain(
        'old-github',
      );
      process.env.MCP_CONFIG_JSON = JSON.stringify({
        serverUrl: 'https://legacy.example/mcp',
      });
      writeMcpConfig();
      expect(readFileSync(join(testHome, 'settings.json'), 'utf8')).toContain(
        'old-gitea',
      );
    });
  });

  describe('Playwright MCP sandbox', () => {
    const defaultManifest = {
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
        playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
      },
    };

    function useManifest(manifest: unknown) {
      process.env.MCP_CONFIG_JSON = JSON.stringify(manifest);
      process.env.DATA_DIR = join(testHome, 'data');
      process.env.FIBE_AGENT_ID = 'agent-browser';
      delete process.env.SESSION_DIR;
    }

    function claudeServers() {
      const settings = JSON.parse(
        readFileSync(join(testHome, '.claude', 'settings.json'), 'utf8'),
      );
      const project = JSON.parse(
        readFileSync(
          join(
            testHome,
            'data',
            'agent-browser',
            'claude_workspace',
            '.mcp.json',
          ),
          'utf8',
        ),
      );
      return { settings: settings.mcpServers, project: project.mcpServers };
    }

    it('adds --no-sandbox to the Playwright MCP in Codex TOML only', () => {
      process.env.AGENT_PROVIDER = 'openai-codex';
      useManifest(defaultManifest);

      writeMcpConfig();

      const content = readFileSync(
        join(testHome, '.codex', 'config.toml'),
        'utf8',
      );
      expect(content).toContain(
        'args = ["-y", "@playwright/mcp@latest", "--no-sandbox"]',
      );
      expect(content).toContain('args = ["-y", "@upstash/context7-mcp"]');
    });

    it('adds --no-sandbox to the Playwright MCP in Claude user and project JSON', () => {
      process.env.AGENT_PROVIDER = 'claude-code';
      useManifest(defaultManifest);

      writeMcpConfig();

      const { settings, project } = claudeServers();
      expect(settings.playwright).toEqual({
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest', '--no-sandbox'],
      });
      expect(project.playwright).toEqual({
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest', '--no-sandbox'],
      });
      expect(settings.context7.args).toEqual(['-y', '@upstash/context7-mcp']);
      expect(project.context7.args).toEqual(['-y', '@upstash/context7-mcp']);
    });

    it('keeps an explicit sandbox choice', () => {
      process.env.AGENT_PROVIDER = 'claude-code';
      useManifest({
        mcpServers: {
          sandboxed: {
            command: 'npx',
            args: ['@playwright/mcp', '--sandbox', '--headless'],
          },
          unsandboxed: {
            command: 'npx',
            args: ['@playwright/mcp@0.0.85', '--no-sandbox'],
          },
          envChoice: {
            command: 'npx',
            args: ['@playwright/mcp@latest'],
            env: { PLAYWRIGHT_MCP_SANDBOX: 'true' },
          },
        },
      });

      writeMcpConfig();

      const { settings } = claudeServers();
      expect(settings.sandboxed.args).toEqual([
        '@playwright/mcp',
        '--sandbox',
        '--headless',
      ]);
      expect(settings.unsandboxed.args).toEqual([
        '@playwright/mcp@0.0.85',
        '--no-sandbox',
      ]);
      expect(settings.envChoice.args).toEqual(['@playwright/mcp@latest']);
    });

    it('does not repeat the flag when the configuration is written again', () => {
      process.env.AGENT_PROVIDER = 'openai-codex';
      useManifest(defaultManifest);

      writeMcpConfig();
      writeMcpConfig();

      const content = readFileSync(
        join(testHome, '.codex', 'config.toml'),
        'utf8',
      );
      expect(content.match(/--no-sandbox/g)).toHaveLength(1);
      expect(content.match(/\[mcp_servers\."playwright"\]/g)).toHaveLength(1);
    });

    it('recognizes the Playwright MCP binaries and leaves other servers alone', () => {
      process.env.AGENT_PROVIDER = 'claude-code';
      useManifest({ mcpServers: {} });
      const extraServers = {
        bin: { command: 'playwright-mcp', args: ['--headless'] },
        path: { command: '/usr/local/bin/mcp-server-playwright' },
        fork: { command: 'npx', args: ['@someone/playwright-mcp-fork'] },
        remote: { serverUrl: 'https://example.test/mcp' },
      };

      writeMcpConfig(extraServers);

      const { settings } = claudeServers();
      expect(settings.bin.args).toEqual(['--headless', '--no-sandbox']);
      expect(settings.path.args).toEqual(['--no-sandbox']);
      expect(settings.fork.args).toEqual(['@someone/playwright-mcp-fork']);
      expect(settings.remote.args).toEqual(['https://example.test/mcp']);
      expect(extraServers.bin.args).toEqual(['--headless']);
    });

    for (const [provider, relativePath] of [
      ['gemini', 'settings.json'],
      ['antigravity', 'config/mcp_config.json'],
      ['cursor', 'mcp.json'],
    ]) {
      it(`adds --no-sandbox for ${provider}`, () => {
        process.env.AGENT_PROVIDER = provider;
        process.env.SESSION_DIR = testHome;
        delete process.env.FIBE_AGENT_ID;
        delete process.env.CONVERSATION_ID;
        process.env.MCP_CONFIG_JSON = JSON.stringify(defaultManifest);

        writeMcpConfig();

        const config = JSON.parse(
          readFileSync(join(testHome, relativePath), 'utf8'),
        );
        expect(config.mcpServers.playwright.args).toEqual([
          '-y',
          '@playwright/mcp@latest',
          '--no-sandbox',
        ]);
      });
    }

    it('adds --no-sandbox for OpenCode', () => {
      process.env.AGENT_PROVIDER = 'opencode';
      delete process.env.OPENCODE_CONFIG_CONTENT;
      process.env.MCP_CONFIG_JSON = JSON.stringify(defaultManifest);

      writeMcpConfig();

      const config = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT ?? '{}');
      expect(config.mcp.playwright.command).toEqual([
        'npx',
        '-y',
        '@playwright/mcp@latest',
        '--no-sandbox',
      ]);
    });
  });
});
