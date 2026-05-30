import { describe, it, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseYaml, loadFibeSettings, applyFibeSettings } from './fibe-settings';

// ─── parseYaml ───────────────────────────────────────────────────────────────

describe('parseYaml', () => {
  it('parses flat string scalars', () => {
    const result = parseYaml('agentProvider: gemini\nollamaUrl: http://localhost:11434\n');
    expect(result).toEqual({ agentProvider: 'gemini', ollamaUrl: 'http://localhost:11434' });
  });

  it('parses boolean scalars', () => {
    const result = parseYaml('gemmaRouterEnabled: true\nlockChatModel: false\nsimplicate: true\n');
    expect(result).toEqual({ gemmaRouterEnabled: true, lockChatModel: false, simplicate: true });
  });

  it('parses integer scalars', () => {
    const result = parseYaml('askUserTimeoutMs: 300000\n');
    expect(result).toEqual({ askUserTimeoutMs: 300000 });
  });

  it('parses float scalars', () => {
    const result = parseYaml('gemmaConfidenceThreshold: 0.75\n');
    expect(result).toEqual({ gemmaConfidenceThreshold: 0.75 });
  });

  it('parses null values', () => {
    const result = parseYaml('agentPassword: null\ndefaultModel: ~\n');
    expect(result).toEqual({ agentPassword: null, defaultModel: null });
  });

  it('ignores comment lines', () => {
    const result = parseYaml('# This is a comment\nagentProvider: mock\n');
    expect(result).toEqual({ agentProvider: 'mock' });
  });

  it('ignores inline comments', () => {
    const result = parseYaml('agentProvider: mock # trailing comment\n');
    expect(result).toEqual({ agentProvider: 'mock' });
  });

  it('parses nested objects', () => {
    const result = parseYaml('mcpConfig:\n  serverUrl: https://mcp.example.com\n  auth: Bearer token\n');
    expect(result).toEqual({ mcpConfig: { serverUrl: 'https://mcp.example.com', auth: 'Bearer token' } });
  });

  it('parses scalar arrays', () => {
    const result = parseYaml('modelOptions:\n  - flash-lite\n  - flash\n  - pro\n');
    expect(result).toEqual({ modelOptions: ['flash-lite', 'flash', 'pro'] });
  });

  it('ignores blank lines', () => {
    const result = parseYaml('\nagentProvider: mock\n\n');
    expect(result).toEqual({ agentProvider: 'mock' });
  });

  it('returns empty object for empty content', () => {
    expect(parseYaml('')).toEqual({});
    expect(parseYaml('   \n  \n')).toEqual({});
  });

  it('handles quoted string values', () => {
    const result = parseYaml('systemPrompt: "You are a TypeScript expert."\n');
    expect(result).toEqual({ systemPrompt: 'You are a TypeScript expert.' });
  });

  it('parses deeply nested objects (3+ levels)', () => {
    const yaml = [
      'mcpConfig:',
      '  mcpServers:',
      '    fibe:',
      '      command: fibe',
      '      args:',
      '        - mcp',
      '        - serve',
      '      env:',
      '        FIBE_API_KEY: test-key',
      '        FIBE_DOMAIN: https://fibe.gg',
      '    docker:',
      '      command: uvx',
      '      args:',
      '        - mcp-server-docker',
      'agentProvider: gemini',
    ].join('\n');
    const result = parseYaml(yaml);
    expect(result.agentProvider).toBe('gemini');
    const mcpConfig = result.mcpConfig as Record<string, unknown>;
    const servers = mcpConfig.mcpServers as Record<string, unknown>;
    const fibe = servers.fibe as Record<string, unknown>;
    expect(fibe.command).toBe('fibe');
    expect(fibe.args).toEqual(['mcp', 'serve']);
    const env = fibe.env as Record<string, string>;
    expect(env.FIBE_API_KEY).toBe('test-key');
    expect(env.FIBE_DOMAIN).toBe('https://fibe.gg');
    const docker = servers.docker as Record<string, unknown>;
    expect(docker.command).toBe('uvx');
    expect(docker.args).toEqual(['mcp-server-docker']);
  });

  it('parses flat credentials as nested object', () => {
    const yaml = [
      'agentCredentials:',
      '  agent_token.txt: sk-ant-123',
      '  auth.json: "{}"',
    ].join('\n');
    const result = parseYaml(yaml);
    expect(result.agentCredentials).toEqual({
      'agent_token.txt': 'sk-ant-123',
      'auth.json': '{}',
    });
  });
});

// ─── Helpers for file-based tests ────────────────────────────────────────────

// ─── loadFibeSettings ────────────────────────────────────────────────────────
describe('loadFibeSettings', () => {
  const MANAGED = ['FIBE_SETTINGS_JSON'];
  const savedEnv: Record<string, string | undefined> = {};
  const originalCwd = process.cwd();
  let tempDir = '';
  let localYml = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'fibe-settings-'));
    process.chdir(tempDir);
    localYml = join(tempDir, 'fibe.yml');
    for (const k of MANAGED) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('returns empty object when no sources configured', () => {
    expect(loadFibeSettings()).toEqual({});
  });

  test('reads from FIBE_SETTINGS_JSON', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ agentProvider: 'mock', lockChatModel: true, simplicate: true });
    const result = loadFibeSettings();
    expect(result.agentProvider).toBe('mock');
    expect(result.lockChatModel).toBe(true);
    expect(result.simplicate).toBe(true);
  });

  test('reads from local fibe.yml when it exists', () => {
    writeFileSync(localYml, 'agentProvider: gemini\n');
    const result = loadFibeSettings();
    expect(result.agentProvider).toBe('gemini');
  });

  test('JSON settings win over YAML on conflict', () => {
    writeFileSync(localYml, 'agentProvider: gemini\ngemmaTimeoutMs: 5000\n');
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ agentProvider: 'mock' });
    const result = loadFibeSettings();
    expect(result.agentProvider).toBe('mock');     // JSON wins
    expect(result.gemmaTimeoutMs).toBe(5000);      // YAML fills the gap
  });

  test('FIBE_SETTINGS_JSON wins over YAML on websocketMaxConnections conflict', () => {
    writeFileSync(localYml, 'websocketMaxConnections: 6\n');
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ websocketMaxConnections: 8 });
    expect(loadFibeSettings().websocketMaxConnections).toBe(8);
  });

  test('handles invalid FIBE_SETTINGS_JSON gracefully', () => {
    process.env.FIBE_SETTINGS_JSON = 'not-valid-json';
    expect(() => loadFibeSettings()).not.toThrow();
    expect(loadFibeSettings()).toEqual({});
  });

  test('handles missing YAML file gracefully (no file = no error)', () => {
    // No file written — loader should silently skip
    expect(() => loadFibeSettings()).not.toThrow();
  });
});

// ─── applyFibeSettings ───────────────────────────────────────────────────────

describe('applyFibeSettings', () => {
  const MANAGED_KEYS = [
    'FIBE_SETTINGS_JSON',
    'AGENT_PROVIDER', 'AGENT_PASSWORD', 'AGENT_AUTH_MODE', 'MODEL_OPTIONS', 'DEFAULT_MODEL', 'CLAUDE_EFFORT',
    'DATA_DIR', 'SESSION_DIR', 'SYSTEM_PROMPT', 'ENCRYPTION_KEY', 'FIBE_AGENT_ID', 'CONVERSATION_ID',
    'MARQUEE_ROOT', 'MARQUEE_ROOT_DOMAIN', 'FIBE_API_KEY', 'POST_INIT_SCRIPT',
    'USER_AVATAR_URL', 'USER_AVATAR_BASE64',
    'ASSISTANT_AVATAR_URL', 'ASSISTANT_AVATAR_BASE64',
    'LOCK_CHAT_MODEL', 'SIMPLICATE',
    'WEBSOCKET_MAX_CONNECTIONS',
    'GEMMA_ROUTER_ENABLED', 'OLLAMA_URL', 'GEMMA_MODEL',
    'GEMMA_CONFIDENCE_THRESHOLD', 'GEMMA_TIMEOUT_MS',
    'ASK_USER_TIMEOUT_MS', 'MCP_CONFIG_JSON', 'OPENCODE_CONFIG_CONTENT',
    'FIBE_SYNC_ENABLED',
    'CORS_ORIGINS', 'FRAME_ANCESTORS',
    'FIBE_OCR_CONVERSION_MAX_BYTES', 'FIBE_OCR_CONVERSION_MAX_OUTPUT_BYTES',
    'FIBE_CLI_VERSION', 'PROVIDER_ARGS', 'SKILL_TOGGLES', 'SYSCHECK_ENABLED',
    'AGENT_CREDENTIALS_JSON', 'AGENT_RUNTIME_FILES_JSON',
    // Credential env keys injected from credentialEnv
    'GEMINI_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY', 'CURSOR_API_KEY',
    'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN',
  ];
  const savedEnv: Record<string, string | undefined> = {};
  const originalCwd = process.cwd();
  let tempDir = '';
  let localYml = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'fibe-settings-'));
    process.chdir(tempDir);
    localYml = join(tempDir, 'fibe.yml');
    for (const k of MANAGED_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('promotes agentProvider to AGENT_PROVIDER', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ agentProvider: 'mock' });
    applyFibeSettings();
    expect(process.env.AGENT_PROVIDER).toBe('mock');
  });

  test('promotes the complete fibe.yml settings object to runtime env vars', () => {
    writeFileSync(localYml, [
      'agentPassword: pass',
      'agentProvider: gemini',
      'agentAuthMode: api-token',
      'modelOptions:',
      '  - flash-lite',
      '  - flash',
      'defaultModel: flash',
      'claudeEffort: high',
      'dataDir: /app/data',
      'sessionDir: /app/data/42/.gemini',
      'systemPrompt: Use the repo rules.',
      'encryptionKey: enc-key',
      'fibeAgentId: agent-42',
      'conversationId: conversation-42',
      'marqueeRoot: /opt/fibe',
      'marqueeRootDomain: example.test',
      'fibeApiKey: fibe-key',
      'fibeSyncEnabled: true',
      'postInitScript: echo ready',
      'corsOrigins: https://app.example.test',
      'frameAncestors: https://frame.example.test',
      'cliVersion: v1.2.3',
      'providerArgs:',
      '  sandbox: false',
      '  max-tokens: 4096',
      '  temperature: 0.2',
      '  config: value with spaces',
      '  c: never',
      'skillToggles:',
      '  fibe-hunks.md: false',
      'syscheckEnabled: false',
      'agentCredentials:',
      '  auth.json: "{}"',
      'agentRuntimeFiles:',
      '  version: 1',
      '  files:',
      '    - path: /app/data/42/.gemini/settings.json',
      '      format: json',
      '      content:',
      '        theme: monokai',
      'credentialEnv:',
      '  GEMINI_API_KEY: gemini-key',
      'mcpConfig:',
      '  mcpServers:',
      '    fibe:',
      '      command: fibe',
      'askUserTimeoutMs: 1234',
      'gemmaRouterEnabled: true',
      'ollamaUrl: http://ollama:11434',
      'gemmaModel: gemma3:12b',
      'gemmaConfidenceThreshold: 0.65',
      'gemmaTimeoutMs: 9876',
      'ocrConversionMaxBytes: 1048576',
      'ocrConversionMaxOutputBytes: 4194304',
      'userAvatarUrl: https://example.test/user.png',
      'userAvatarBase64: user-base64',
      'assistantAvatarUrl: https://example.test/bot.png',
      'assistantAvatarBase64: assistant-base64',
      'lockChatModel: true',
      'simplicate: true',
    ].join('\n') + '\n');

    applyFibeSettings();

    expect(process.env.AGENT_PASSWORD).toBe('pass');
    expect(process.env.AGENT_PROVIDER).toBe('gemini');
    expect(process.env.AGENT_AUTH_MODE).toBe('api-token');
    expect(process.env.MODEL_OPTIONS).toBe('flash-lite,flash');
    expect(process.env.DEFAULT_MODEL).toBe('flash');
    expect(process.env.CLAUDE_EFFORT).toBe('high');
    expect(process.env.DATA_DIR).toBe('/app/data');
    expect(process.env.SESSION_DIR).toBe('/app/data/42/.gemini');
    expect(process.env.SYSTEM_PROMPT).toBe('Use the repo rules.');
    expect(process.env.ENCRYPTION_KEY).toBe('enc-key');
    expect(process.env.FIBE_AGENT_ID).toBe('agent-42');
    expect(process.env.CONVERSATION_ID).toBe('conversation-42');
    expect(process.env.MARQUEE_ROOT).toBe('/opt/fibe');
    expect(process.env.MARQUEE_ROOT_DOMAIN).toBe('example.test');
    expect(process.env.FIBE_API_KEY).toBe('fibe-key');
    expect(process.env.FIBE_SYNC_ENABLED).toBe('true');
    expect(process.env.POST_INIT_SCRIPT).toBe('echo ready');
    expect(process.env.CORS_ORIGINS).toBe('https://app.example.test');
    expect(process.env.FRAME_ANCESTORS).toBe('https://frame.example.test');
    expect(process.env.FIBE_CLI_VERSION).toBe('v1.2.3');
    expect(process.env.PROVIDER_ARGS).toBe('{"sandbox":false,"max-tokens":4096,"temperature":0.2,"config":"value with spaces","c":"never"}');
    expect(process.env.SKILL_TOGGLES).toBe('{"fibe-hunks.md":false}');
    expect(process.env.SYSCHECK_ENABLED).toBe('false');
    expect(process.env.AGENT_CREDENTIALS_JSON).toBe('{"auth.json":"{}"}');
    expect(process.env.AGENT_RUNTIME_FILES_JSON).toBe('{"version":1,"files":[{"path":"/app/data/42/.gemini/settings.json","format":"json","content":{"theme":"monokai"}}]}');
    expect(process.env.GEMINI_API_KEY).toBe('gemini-key');
    expect(process.env.MCP_CONFIG_JSON).toBe('{"mcpServers":{"fibe":{"command":"fibe"}}}');
    expect(process.env.ASK_USER_TIMEOUT_MS).toBe('1234');
    expect(process.env.GEMMA_ROUTER_ENABLED).toBe('true');
    expect(process.env.OLLAMA_URL).toBe('http://ollama:11434');
    expect(process.env.GEMMA_MODEL).toBe('gemma3:12b');
    expect(process.env.GEMMA_CONFIDENCE_THRESHOLD).toBe('0.65');
    expect(process.env.GEMMA_TIMEOUT_MS).toBe('9876');
    expect(process.env.FIBE_OCR_CONVERSION_MAX_BYTES).toBe('1048576');
    expect(process.env.FIBE_OCR_CONVERSION_MAX_OUTPUT_BYTES).toBe('4194304');
    expect(process.env.USER_AVATAR_URL).toBe('https://example.test/user.png');
    expect(process.env.USER_AVATAR_BASE64).toBe('user-base64');
    expect(process.env.ASSISTANT_AVATAR_URL).toBe('https://example.test/bot.png');
    expect(process.env.ASSISTANT_AVATAR_BASE64).toBe('assistant-base64');
    expect(process.env.LOCK_CHAT_MODEL).toBe('true');
    expect(process.env.SIMPLICATE).toBe('true');
  });

  test('promotes lockChatModel to LOCK_CHAT_MODEL', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ lockChatModel: true });
    applyFibeSettings();
    expect(process.env.LOCK_CHAT_MODEL).toBe('true');
  });

  test('promotes simplicate to SIMPLICATE', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ simplicate: true });
    applyFibeSettings();
    expect(process.env.SIMPLICATE).toBe('true');
  });

  test('promotes websocketMaxConnections to WEBSOCKET_MAX_CONNECTIONS', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ websocketMaxConnections: 10 });
    applyFibeSettings();
    expect(process.env.WEBSOCKET_MAX_CONNECTIONS).toBe('10');
  });

  test('does NOT overwrite existing websocket env var', () => {
    process.env.WEBSOCKET_MAX_CONNECTIONS = '4';
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ websocketMaxConnections: 10 });
    applyFibeSettings();
    expect(process.env.WEBSOCKET_MAX_CONNECTIONS).toBe('4');
  });

  test('promotes OCR conversion limits without overwriting individual env vars', () => {
    process.env.FIBE_OCR_CONVERSION_MAX_OUTPUT_BYTES = '99';
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({
      ocrConversionMaxBytes: 123,
      ocrConversionMaxOutputBytes: 456,
    });
    applyFibeSettings();
    expect(process.env.FIBE_OCR_CONVERSION_MAX_BYTES).toBe('123');
    expect(process.env.FIBE_OCR_CONVERSION_MAX_OUTPUT_BYTES).toBe('99');
  });

  test('promotes avatar settings', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({
      userAvatarUrl: 'https://example.com/user.png',
      assistantAvatarUrl: 'https://example.com/bot.png',
    });
    applyFibeSettings();
    expect(process.env.USER_AVATAR_URL).toBe('https://example.com/user.png');
    expect(process.env.ASSISTANT_AVATAR_URL).toBe('https://example.com/bot.png');
  });

  test('promotes mcpConfig as JSON string to MCP_CONFIG_JSON', () => {
    const mcpConfig = { mcpServers: { fibe: { serverUrl: 'https://mcp.example.com' } } };
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ mcpConfig });
    applyFibeSettings();
    expect(process.env.MCP_CONFIG_JSON).toBe(JSON.stringify(mcpConfig));
  });

  test('promotes modelOptions array to comma-separated MODEL_OPTIONS', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ modelOptions: ['flash-lite', 'flash', 'pro'] });
    applyFibeSettings();
    expect(process.env.MODEL_OPTIONS).toBe('flash-lite,flash,pro');
  });

  test('promotes string modelOptions as-is to MODEL_OPTIONS', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ modelOptions: 'flash,pro' });
    applyFibeSettings();
    expect(process.env.MODEL_OPTIONS).toBe('flash,pro');
  });

  test('promotes claudeEffort to CLAUDE_EFFORT', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ claudeEffort: 'high' });
    applyFibeSettings();
    expect(process.env.CLAUDE_EFFORT).toBe('high');
  });

  test('does NOT overwrite existing individual env vars (individual wins)', () => {
    process.env.AGENT_PROVIDER = 'claude-code'; // pre-existing individual var
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ agentProvider: 'mock' });
    applyFibeSettings();
    expect(process.env.AGENT_PROVIDER).toBe('claude-code');
  });

  test('does not promote null YAML values as string "null"', () => {
    writeFileSync(localYml, 'agentProvider: null\nsystemPrompt: null\n');
    applyFibeSettings();
    expect(process.env.AGENT_PROVIDER).toBeUndefined();
    expect(process.env.SYSTEM_PROMPT).toBeUndefined();
  });

  test('promotes Gemma router settings', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({
      gemmaRouterEnabled: true,
      ollamaUrl: 'http://ollama:11434',
      gemmaModel: 'gemma3:4b',
      gemmaConfidenceThreshold: 0.8,
      gemmaTimeoutMs: 15000,
    });
    applyFibeSettings();
    expect(process.env.GEMMA_ROUTER_ENABLED).toBe('true');
    expect(process.env.OLLAMA_URL).toBe('http://ollama:11434');
    expect(process.env.GEMMA_MODEL).toBe('gemma3:4b');
    expect(process.env.GEMMA_CONFIDENCE_THRESHOLD).toBe('0.8');
    expect(process.env.GEMMA_TIMEOUT_MS).toBe('15000');
  });

  test('reads YAML and applies env vars from it', () => {
    writeFileSync(localYml, 'agentProvider: gemini\nlockChatModel: false\nsimplicate: true\n');
    applyFibeSettings();
    expect(process.env.AGENT_PROVIDER).toBe('gemini');
    expect(process.env.LOCK_CHAT_MODEL).toBe('false');
    expect(process.env.SIMPLICATE).toBe('true');
  });

  test('promotes fibeSyncEnabled=true to FIBE_SYNC_ENABLED=true', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ fibeSyncEnabled: true });
    applyFibeSettings();
    expect(process.env.FIBE_SYNC_ENABLED).toBe('true');
  });

  test('promotes corsOrigins and frameAncestors', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({
      corsOrigins: 'https://app.example.com',
      frameAncestors: 'https://parent.example.com',
    });
    applyFibeSettings();
    expect(process.env.CORS_ORIGINS).toBe('https://app.example.com');
    expect(process.env.FRAME_ANCESTORS).toBe('https://parent.example.com');
  });

  test('promotes credentialEnv entries to process.env', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({
      credentialEnv: { GEMINI_API_KEY: 'AIza-test', ANTHROPIC_API_KEY: 'sk-ant-test' },
    });
    applyFibeSettings();
    expect(process.env.GEMINI_API_KEY).toBe('AIza-test');
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
  });

  test('credentialEnv does not overwrite existing env vars', () => {
    process.env.GEMINI_API_KEY = 'already-set';
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({
      credentialEnv: { GEMINI_API_KEY: 'from-yaml' },
    });
    applyFibeSettings();
    expect(process.env.GEMINI_API_KEY).toBe('already-set');
  });

  test('promotes mcpConfigJson string directly to MCP_CONFIG_JSON', () => {
    const mcpJson = '{"mcpServers":{"fibe":{"command":"fibe"}}}';
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ mcpConfigJson: mcpJson });
    applyFibeSettings();
    expect(process.env.MCP_CONFIG_JSON).toBe(mcpJson);
  });

  test('mcpConfigJson takes precedence over mcpConfig', () => {
    const mcpJson = '{"mcpServers":{"fibe":{"from":"string"}}}';
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({
      mcpConfigJson: mcpJson,
      mcpConfig: { mcpServers: { fibe: { from: 'object' } } },
    });
    applyFibeSettings();
    expect(process.env.MCP_CONFIG_JSON).toBe(mcpJson);
  });

  test('merges opencodeConfig into OPENCODE_CONFIG_CONTENT', () => {
    process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ permission: 'allow' });
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({
      opencodeConfig: {
        provider: {
          anthropic: {
            options: {
              baseURL: 'https://anthropic.example.test/v1',
            },
          },
        },
      },
    });
    applyFibeSettings();
    expect(JSON.parse(process.env.OPENCODE_CONFIG_CONTENT ?? '{}')).toEqual({
      permission: 'allow',
      provider: {
        anthropic: {
          options: {
            baseURL: 'https://anthropic.example.test/v1',
          },
        },
      },
    });
  });

  test('promotes credentialEnv from YAML file', () => {
    writeFileSync(localYml, 'credentialEnv:\n  CLAUDE_CODE_OAUTH_TOKEN: test-token\n');
    applyFibeSettings();
    expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('test-token');
  });

  test('promotes agentCredentials object to AGENT_CREDENTIALS_JSON string', () => {
    writeFileSync(localYml, 'agentCredentials:\n  agent_token.txt: sk-ant-123\n');
    applyFibeSettings();
    expect(process.env.AGENT_CREDENTIALS_JSON).toBe('{"agent_token.txt":"sk-ant-123"}');
  });

  test('promotes mcpConfig from nested YAML to MCP_CONFIG_JSON string', () => {
    writeFileSync(localYml, [
      'mcpConfig:',
      '  mcpServers:',
      '    fibe:',
      '      command: fibe',
    ].join('\n') + '\n');
    applyFibeSettings();
    expect(process.env.MCP_CONFIG_JSON).toBe('{"mcpServers":{"fibe":{"command":"fibe"}}}');
  });

  test('agentCredentialsJson string takes precedence over agentCredentials object', () => {
    const json = '{"token.txt":"from-string"}';
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({
      agentCredentialsJson: json,
      agentCredentials: { 'token.txt': 'from-object' },
    });
    applyFibeSettings();
    expect(process.env.AGENT_CREDENTIALS_JSON).toBe(json);
  });
});
