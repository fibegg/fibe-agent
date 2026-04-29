import { describe, it, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseYaml, loadFibeSettings, applyFibeSettings } from './fibe-settings';

// ─── parseYaml ───────────────────────────────────────────────────────────────

describe('parseYaml', () => {
  it('parses flat string scalars', () => {
    const result = parseYaml('agentProvider: gemini\nollamaUrl: http://localhost:11434\n');
    expect(result).toEqual({ agentProvider: 'gemini', ollamaUrl: 'http://localhost:11434' });
  });

  it('parses boolean scalars', () => {
    const result = parseYaml('gemmaRouterEnabled: true\nlockChatModel: false\n');
    expect(result).toEqual({ gemmaRouterEnabled: true, lockChatModel: false });
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
});

// ─── Helpers for file-based tests ────────────────────────────────────────────

let testDir: string;

function setupTestDir() {
  testDir = join(tmpdir(), `fibe-settings-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
}

function teardownTestDir() {
  try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ok */ }
}

// ─── loadFibeSettings ────────────────────────────────────────────────────────
// The loader checks '/app/fibe.yml' and './fibe.yml' (cwd).
// We use cwd-based path by writing to process.cwd()/fibe.yml and then cleaning up.

describe('loadFibeSettings', () => {
  const MANAGED = ['FIBE_SETTINGS_JSON'];
  const savedEnv: Record<string, string | undefined> = {};
  // Path to local fibe.yml (CWD-based, second candidate checked by loader)
  const localYml = join(process.cwd(), 'fibe.yml');

  beforeEach(() => {
    for (const k of MANAGED) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    // Clean up temp fibe.yml if we created one
    try { rmSync(localYml); } catch { /* may not exist */ }
  });

  test('returns empty object when no sources configured', () => {
    expect(loadFibeSettings()).toEqual({});
  });

  test('reads from FIBE_SETTINGS_JSON', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ agentProvider: 'mock', lockChatModel: true });
    const result = loadFibeSettings();
    expect(result.agentProvider).toBe('mock');
    expect(result.lockChatModel).toBe(true);
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
    'AGENT_PROVIDER', 'AGENT_PASSWORD', 'MODEL_OPTIONS', 'DEFAULT_MODEL',
    'USER_AVATAR_URL', 'USER_AVATAR_BASE64',
    'ASSISTANT_AVATAR_URL', 'ASSISTANT_AVATAR_BASE64',
    'LOCK_CHAT_MODEL',
    'GEMMA_ROUTER_ENABLED', 'OLLAMA_URL', 'GEMMA_MODEL',
    'GEMMA_CONFIDENCE_THRESHOLD', 'GEMMA_TIMEOUT_MS',
    'ASK_USER_TIMEOUT_MS', 'MCP_CONFIG_JSON', 'DOCKER_MCP_CONFIG_JSON',
    'FIBE_SYNC_ENABLED', 'DATA_DIR', 'FIBE_API_URL', 'FIBE_API_KEY',
    'CORS_ORIGINS', 'FRAME_ANCESTORS',
  ];
  const savedEnv: Record<string, string | undefined> = {};
  const localYml = join(process.cwd(), 'fibe.yml');

  beforeEach(() => {
    for (const k of MANAGED_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    try { rmSync(localYml); } catch { /* may not exist */ }
  });

  test('promotes agentProvider to AGENT_PROVIDER', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ agentProvider: 'mock' });
    applyFibeSettings();
    expect(process.env.AGENT_PROVIDER).toBe('mock');
  });

  test('promotes lockChatModel to LOCK_CHAT_MODEL', () => {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ lockChatModel: true });
    applyFibeSettings();
    expect(process.env.LOCK_CHAT_MODEL).toBe('true');
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

  test('does NOT overwrite existing individual env vars (individual wins)', () => {
    process.env.AGENT_PROVIDER = 'claude-code'; // pre-existing individual var
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({ agentProvider: 'mock' });
    applyFibeSettings();
    expect(process.env.AGENT_PROVIDER).toBe('claude-code');
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
    writeFileSync(localYml, 'agentProvider: gemini\nlockChatModel: false\n');
    applyFibeSettings();
    expect(process.env.AGENT_PROVIDER).toBe('gemini');
    expect(process.env.LOCK_CHAT_MODEL).toBe('false');
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
});
