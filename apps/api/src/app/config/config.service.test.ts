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
    envBackup.PLAYGROUNDS_DIR = process.env.PLAYGROUNDS_DIR;
    envBackup.FIBE_AGENT_ID = process.env.FIBE_AGENT_ID;
    envBackup.CONVERSATION_ID = process.env.CONVERSATION_ID;
    envBackup.FIBE_API_KEY = process.env.FIBE_API_KEY;
    envBackup.FIBE_DOMAIN = process.env.FIBE_DOMAIN;
    envBackup.FIBE_SYNC_ENABLED = process.env.FIBE_SYNC_ENABLED;
    envBackup.CLAUDE_EFFORT = process.env.CLAUDE_EFFORT;
    // Clear to avoid cross-test leakage
    delete process.env.FIBE_SETTINGS_JSON;
    delete process.env.FIBE_SYNC_ENABLED;
    delete process.env.CLAUDE_EFFORT;
  });

  afterEach(() => {
    process.env.FIBE_SETTINGS_JSON = envBackup.FIBE_SETTINGS_JSON;
    process.env.PLAYGROUNDS_DIR = envBackup.PLAYGROUNDS_DIR;
    process.env.FIBE_AGENT_ID = envBackup.FIBE_AGENT_ID;
    process.env.CONVERSATION_ID = envBackup.CONVERSATION_ID;
    process.env.FIBE_API_KEY = envBackup.FIBE_API_KEY;
    process.env.FIBE_DOMAIN = envBackup.FIBE_DOMAIN;
    process.env.FIBE_SYNC_ENABLED = envBackup.FIBE_SYNC_ENABLED;
    if (envBackup.CLAUDE_EFFORT === undefined) delete process.env.CLAUDE_EFFORT;
    else process.env.CLAUDE_EFFORT = envBackup.CLAUDE_EFFORT;
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
});
