import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigService } from './config.service';
import { join } from 'node:path';

/**
 * ConfigService now reads from a frozen FibeSettings snapshot at construction.
 * To test specific settings, set FIBE_SETTINGS_JSON before constructing.
 * Go SDK vars (FIBE_API_KEY, FIBE_DOMAIN, FIBE_AGENT_ID) still read process.env.
 */
describe('ConfigService', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.FIBE_SETTINGS_JSON = process.env.FIBE_SETTINGS_JSON;
    envBackup.FIBE_SETTINGS_YAML_PATHS = process.env.FIBE_SETTINGS_YAML_PATHS;
    envBackup.PLAYGROUNDS_DIR = process.env.PLAYGROUNDS_DIR;
    envBackup.FIBE_AGENT_ID = process.env.FIBE_AGENT_ID;
    envBackup.CONVERSATION_ID = process.env.CONVERSATION_ID;
    envBackup.FIBE_API_KEY = process.env.FIBE_API_KEY;
    envBackup.FIBE_DOMAIN = process.env.FIBE_DOMAIN;
    envBackup.FIBE_SYNC_ENABLED = process.env.FIBE_SYNC_ENABLED;
    envBackup.WEBSOCKET_MAX_CONNECTIONS = process.env.WEBSOCKET_MAX_CONNECTIONS;
    envBackup.FIBE_OCR_CONVERSION_MAX_BYTES = process.env.FIBE_OCR_CONVERSION_MAX_BYTES;
    envBackup.FIBE_OCR_CONVERSION_MAX_OUTPUT_BYTES = process.env.FIBE_OCR_CONVERSION_MAX_OUTPUT_BYTES;
    envBackup.CLAUDE_EFFORT = process.env.CLAUDE_EFFORT;
    envBackup.GEMMA_ROUTER_ENABLED = process.env.GEMMA_ROUTER_ENABLED;
    envBackup.OLLAMA_URL = process.env.OLLAMA_URL;
    envBackup.GEMMA_MODEL = process.env.GEMMA_MODEL;
    envBackup.GEMMA_CONFIDENCE_THRESHOLD = process.env.GEMMA_CONFIDENCE_THRESHOLD;
    envBackup.GEMMA_TIMEOUT_MS = process.env.GEMMA_TIMEOUT_MS;
    // Clear to avoid cross-test leakage
    delete process.env.FIBE_SETTINGS_JSON;
    process.env.FIBE_SETTINGS_YAML_PATHS = join(process.cwd(), 'config-service-test-fibe.yml');
    delete process.env.FIBE_SYNC_ENABLED;
    delete process.env.WEBSOCKET_MAX_CONNECTIONS;
    delete process.env.FIBE_OCR_CONVERSION_MAX_BYTES;
    delete process.env.FIBE_OCR_CONVERSION_MAX_OUTPUT_BYTES;
    delete process.env.CLAUDE_EFFORT;
    delete process.env.GEMMA_ROUTER_ENABLED;
    delete process.env.OLLAMA_URL;
    delete process.env.GEMMA_MODEL;
    delete process.env.GEMMA_CONFIDENCE_THRESHOLD;
    delete process.env.GEMMA_TIMEOUT_MS;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function withSettings(settings: Record<string, unknown>): ConfigService {
    process.env.FIBE_SETTINGS_JSON = JSON.stringify(settings);
    return new ConfigService();
  }

  test('getAgentPassword returns undefined when not set', () => {
    expect(new ConfigService().getAgentPassword()).toBeUndefined();
  });

  test('getAgentPassword returns value from settings', () => {
    const config = withSettings({ agentPassword: 'secret' });
    expect(config.getAgentPassword()).toBe('secret');
  });

  test('getModelOptions returns empty array when not set', () => {
    expect(new ConfigService().getModelOptions()).toEqual([]);
  });

  test('getModelOptions returns trimmed non-empty parts', () => {
    const config = withSettings({ modelOptions: ' a , , b ' });
    expect(config.getModelOptions()).toEqual(['a', 'b']);
  });

  test('getDefaultModel returns defaultModel from settings', () => {
    const config = withSettings({ defaultModel: 'pro', modelOptions: 'flash,flash-lite' });
    expect(config.getDefaultModel()).toBe('pro');
  });

  test('getDefaultModel returns first of modelOptions when defaultModel not set', () => {
    const config = withSettings({ modelOptions: 'flash-lite,flash,pro' });
    expect(config.getDefaultModel()).toBe('flash-lite');
  });

  test('getDefaultModel returns empty string when no options', () => {
    expect(new ConfigService().getDefaultModel()).toBe('');
  });

  test('getDefaultEffort returns claudeEffort from settings', () => {
    const config = withSettings({ claudeEffort: 'high' });
    expect(config.getDefaultEffort()).toBe('high');
  });

  test('getDefaultEffort returns CLAUDE_EFFORT env when settings are absent', () => {
    process.env.CLAUDE_EFFORT = 'medium';
    expect(new ConfigService().getDefaultEffort()).toBe('medium');
  });

  test('getDefaultEffort falls back to max for invalid values', () => {
    const config = withSettings({ claudeEffort: 'turbo' });
    expect(config.getDefaultEffort()).toBe('max');
  });

  test('getDataDir returns dataDir from settings', () => {
    const config = withSettings({ dataDir: '/custom/data' });
    expect(config.getDataDir()).toBe('/custom/data');
  });

  test('getDataDir returns default under cwd when not set', () => {
    expect(new ConfigService().getDataDir()).toBe(join(process.cwd(), 'data'));
  });

  test('getSystemPrompt returns systemPrompt from settings', () => {
    const config = withSettings({ systemPrompt: 'You are a helpful assistant' });
    expect(config.getSystemPrompt()).toBe('You are a helpful assistant');
  });

  test('getSystemPrompt returns undefined when not set', () => {
    expect(new ConfigService().getSystemPrompt()).toBeUndefined();
  });

  test('getMarqueeRoot returns marqueeRoot from settings', () => {
    const config = withSettings({ marqueeRoot: '/custom/marquee' });
    expect(config.getMarqueeRoot()).toBe('/custom/marquee');
  });

  test('getMarqueeRoot returns /opt/fibe when not set', () => {
    expect(new ConfigService().getMarqueeRoot()).toBe('/opt/fibe');
  });

  test('getPlaygroundsDir returns PLAYGROUNDS_DIR when set', () => {
    process.env.PLAYGROUNDS_DIR = '/custom/playground';
    expect(new ConfigService().getPlaygroundsDir()).toBe('/custom/playground');
  });

  test('getPlaygroundsDir returns default under cwd when not set', () => {
    delete process.env.PLAYGROUNDS_DIR;
    expect(new ConfigService().getPlaygroundsDir()).toBe(join(process.cwd(), 'playground'));
  });

  test('getPostInitScript returns undefined when not set', () => {
    expect(new ConfigService().getPostInitScript()).toBeUndefined();
  });

  test('getPostInitScript returns value from settings', () => {
    const config = withSettings({ postInitScript: 'echo hello' });
    expect(config.getPostInitScript()).toBe('echo hello');
  });

  test('getPostInitScript returns undefined for whitespace-only', () => {
    const config = withSettings({ postInitScript: '   ' });
    expect(config.getPostInitScript()).toBeUndefined();
  });

  test('getConversationId returns default when neither env set', () => {
    delete process.env.FIBE_AGENT_ID;
    delete process.env.CONVERSATION_ID;
    expect(new ConfigService().getConversationId()).toBe('default');
  });

  test('getConversationId returns FIBE_AGENT_ID when set', () => {
    process.env.FIBE_AGENT_ID = 'agent-123';
    delete process.env.CONVERSATION_ID;
    expect(new ConfigService().getConversationId()).toBe('agent-123');
  });

  test('getConversationId prefers FIBE_AGENT_ID over CONVERSATION_ID', () => {
    process.env.FIBE_AGENT_ID = 'fibe-id';
    process.env.CONVERSATION_ID = 'conv-id';
    expect(new ConfigService().getConversationId()).toBe('fibe-id');
  });

  test('getConversationId returns CONVERSATION_ID when FIBE_AGENT_ID not set', () => {
    delete process.env.FIBE_AGENT_ID;
    process.env.CONVERSATION_ID = 'conv-456';
    expect(new ConfigService().getConversationId()).toBe('conv-456');
  });

  test('getConversationId trims whitespace', () => {
    process.env.FIBE_AGENT_ID = '  id-with-spaces  ';
    expect(new ConfigService().getConversationId()).toBe('id-with-spaces');
  });

  test('getConversationId returns default when value is empty after trim', () => {
    process.env.FIBE_AGENT_ID = '   ';
    expect(new ConfigService().getConversationId()).toBe('default');
  });

  test('getConversationDataDir is under getDataDir and includes sanitized id', () => {
    process.env.FIBE_AGENT_ID = 'agent_1';
    const config = withSettings({ dataDir: '/base' });
    expect(config.getConversationDataDir()).toBe('/base/agent_1');
  });

  test('getConversationDataDir sanitizes path-unsafe characters', () => {
    process.env.FIBE_AGENT_ID = 'agent/with..slashes';
    const config = withSettings({ dataDir: '/base' });
    expect(config.getConversationDataDir()).toBe('/base/agent_with_slashes');
  });

  test('getConversationDataDir uses default when id would be empty after sanitize', () => {
    process.env.FIBE_AGENT_ID = '../..';
    const config = withSettings({ dataDir: '/base' });
    expect(config.getConversationDataDir()).toBe('/base/default');
  });

  test('getConversationDataDir keeps alphanumeric dash underscore', () => {
    process.env.FIBE_AGENT_ID = 'abc-123_XYZ';
    const config = withSettings({ dataDir: '/data' });
    expect(config.getConversationDataDir()).toBe('/data/abc-123_XYZ');
  });

  // Go SDK vars — still read from process.env
  test('getFibeApiKey returns FIBE_API_KEY when set', () => {
    process.env.FIBE_API_KEY = 'test-key-123';
    expect(new ConfigService().getFibeApiKey()).toBe('test-key-123');
  });

  test('getFibeApiKey returns undefined when not set', () => {
    delete process.env.FIBE_API_KEY;
    expect(new ConfigService().getFibeApiKey()).toBeUndefined();
  });

  test('getFibeApiUrl derives https from FIBE_DOMAIN', () => {
    process.env.FIBE_DOMAIN = 'fibe.gg';
    expect(new ConfigService().getFibeApiUrl()).toBe('https://fibe.gg');
  });

  test('getFibeApiUrl derives http for .test domains', () => {
    process.env.FIBE_DOMAIN = 'rails.test:3000';
    expect(new ConfigService().getFibeApiUrl()).toBe('http://rails.test:3000');
  });

  test('getFibeApiUrl derives http for localhost', () => {
    process.env.FIBE_DOMAIN = 'localhost:3000';
    expect(new ConfigService().getFibeApiUrl()).toBe('http://localhost:3000');
  });

  test('getFibeApiUrl returns undefined when FIBE_DOMAIN not set', () => {
    delete process.env.FIBE_DOMAIN;
    expect(new ConfigService().getFibeApiUrl()).toBeUndefined();
  });

  test('getFibeAgentId returns FIBE_AGENT_ID when set', () => {
    process.env.FIBE_AGENT_ID = 'agent-42';
    expect(new ConfigService().getFibeAgentId()).toBe('agent-42');
  });

  test('isFibeSyncEnabled returns true from settings', () => {
    const config = withSettings({ fibeSyncEnabled: true });
    expect(config.isFibeSyncEnabled()).toBe(true);
  });

  test('isFibeSyncEnabled returns true from env fallback', () => {
    process.env.FIBE_SYNC_ENABLED = 'true';
    expect(new ConfigService().isFibeSyncEnabled()).toBe(true);
  });

  test('isFibeSyncEnabled returns false when not set', () => {
    expect(new ConfigService().isFibeSyncEnabled()).toBe(false);
  });

  test('isFibeSyncEnabled returns false for non-true values', () => {
    const config = withSettings({ fibeSyncEnabled: false });
    expect(config.isFibeSyncEnabled()).toBe(false);
  });

  test('getWebsocketMaxConnections defaults to 5', () => {
    expect(new ConfigService().getWebsocketMaxConnections()).toBe(5);
  });

  test('getWebsocketMaxConnections reads from settings', () => {
    const config = withSettings({ websocketMaxConnections: 10 });
    expect(config.getWebsocketMaxConnections()).toBe(10);
  });

  test('getWebsocketMaxConnections prefers individual env var', () => {
    process.env.WEBSOCKET_MAX_CONNECTIONS = '12';
    const config = withSettings({ websocketMaxConnections: 10 });
    expect(config.getWebsocketMaxConnections()).toBe(12);
  });

  test('getWebsocketMaxConnections falls back to 5 for invalid values', () => {
    expect(withSettings({ websocketMaxConnections: 0 }).getWebsocketMaxConnections()).toBe(5);
    expect(withSettings({ websocketMaxConnections: 'abc' }).getWebsocketMaxConnections()).toBe(5);
    process.env.WEBSOCKET_MAX_CONNECTIONS = '-1';
    expect(withSettings({ websocketMaxConnections: 10 }).getWebsocketMaxConnections()).toBe(5);
  });

  test('returns OCR conversion limits from settings', () => {
    const config = withSettings({
      ocrConversionMaxBytes: 1048576,
      ocrConversionMaxOutputBytes: '4194304',
    });

    expect(config.getOcrConversionMaxBytes()).toBe(1048576);
    expect(config.getOcrConversionMaxOutputBytes()).toBe(4194304);
  });

  test('prefers OCR conversion limit env vars over settings', () => {
    process.env.FIBE_OCR_CONVERSION_MAX_BYTES = '2097152';
    process.env.FIBE_OCR_CONVERSION_MAX_OUTPUT_BYTES = '8388608';
    const config = withSettings({
      ocrConversionMaxBytes: 1048576,
      ocrConversionMaxOutputBytes: 4194304,
    });

    expect(config.getOcrConversionMaxBytes()).toBe(2097152);
    expect(config.getOcrConversionMaxOutputBytes()).toBe(8388608);
  });

  test('falls back to OCR conversion defaults for invalid values', () => {
    expect(withSettings({ ocrConversionMaxBytes: 0 }).getOcrConversionMaxBytes()).toBe(10 * 1024 * 1024);
    expect(withSettings({ ocrConversionMaxOutputBytes: 'abc' }).getOcrConversionMaxOutputBytes()).toBe(25 * 1024 * 1024);
    process.env.FIBE_OCR_CONVERSION_MAX_BYTES = '-1';
    expect(withSettings({ ocrConversionMaxBytes: 1048576 }).getOcrConversionMaxBytes()).toBe(10 * 1024 * 1024);
  });

  test('returns storage and platform routing settings from fibe settings', () => {
    const config = withSettings({
      encryptionKey: 'enc-key',
      sessionDir: '/app/data/42/.codex',
      marqueeRootDomain: 'marquee.example.test',
    });

    expect(config.getEncryptionKey()).toBe('enc-key');
    expect(config.getSessionDir()).toBe('/app/data/42/.codex');
    expect(config.getMarqueeRootDomain()).toBe('marquee.example.test');
  });

  test('returns MCP config and cascade settings from fibe settings', () => {
    const mcpConfig = { mcpServers: { fibe: { command: 'fibe' } } };
    const providerArgs = {
      sandbox: false,
      'max-tokens': 4096,
      temperature: 0.2,
      config: 'value with spaces',
      c: 'never',
    };
    const skillToggles = { 'fibe-hunks.md': false };
    const config = withSettings({
      mcpConfig,
      providerArgs,
      cliVersion: 'v1.2.3',
      skillToggles,
      syscheckEnabled: false,
    });

    expect(config.getMcpConfig()).toEqual(mcpConfig);
    expect(config.getProviderArgs()).toEqual(providerArgs);
    expect(config.getCliVersion()).toBe('v1.2.3');
    expect(config.getSkillToggles()).toEqual(skillToggles);
    expect(config.isSyscheckEnabled()).toBe(false);
  });

  test('isSyscheckEnabled defaults to true unless settings explicitly disable it', () => {
    expect(new ConfigService().isSyscheckEnabled()).toBe(true);
    expect(withSettings({ syscheckEnabled: true }).isSyscheckEnabled()).toBe(true);
  });

  test('returns Gemma router settings from fibe settings with bounds applied', () => {
    const config = withSettings({
      gemmaRouterEnabled: true,
      ollamaUrl: 'http://ollama:11434',
      gemmaModel: 'gemma3:12b',
      gemmaConfidenceThreshold: 1.5,
      gemmaTimeoutMs: 250,
    });

    expect(config.isGemmaRouterEnabled()).toBe(true);
    expect(config.getGemmaUrl()).toBe('http://ollama:11434');
    expect(config.getGemmaModel()).toBe('gemma3:12b');
    expect(config.getGemmaConfidenceThreshold()).toBe(1);
    expect(config.getGemmaTimeoutMs()).toBe(500);
  });

  test('returns Gemma router env fallbacks when settings are absent', () => {
    process.env.GEMMA_ROUTER_ENABLED = 'true';
    process.env.OLLAMA_URL = 'http://env-ollama:11434';
    process.env.GEMMA_MODEL = 'env-gemma';
    process.env.GEMMA_CONFIDENCE_THRESHOLD = '0.45';
    process.env.GEMMA_TIMEOUT_MS = '1500';

    const config = new ConfigService();

    expect(config.isGemmaRouterEnabled()).toBe(true);
    expect(config.getGemmaUrl()).toBe('http://env-ollama:11434');
    expect(config.getGemmaModel()).toBe('env-gemma');
    expect(config.getGemmaConfidenceThreshold()).toBe(0.45);
    expect(config.getGemmaTimeoutMs()).toBe(1500);
  });
});
