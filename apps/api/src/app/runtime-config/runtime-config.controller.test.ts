import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

/**
 * Tests for the runtime-config response shape/logic without importing
 * the NestJS-decorated controller class (which triggers decorator
 * metadata errors in Bun's test runner).
 */

interface RuntimeConfig {
  userAvatarUrl: string | null;
  userAvatarBase64: string | null;
  assistantAvatarUrl: string | null;
  assistantAvatarBase64: string | null;
  agentProvider: string | null;
  agentProviderLabel: string | null;
  simplicate: boolean;
}

function providerLabel(provider: string | null): string | null {
  if (!provider) return null;
  switch (provider.trim().toLowerCase()) {
    case 'claude-code':
    case 'claude':
      return 'Claude';
    case 'openai-codex':
    case 'openai':
    case 'codex':
      return 'Codex';
    case 'gemini':
      return 'Gemini';
    case 'opencode':
    case 'opencodex':
      return 'OpenCode';
    case 'cursor':
      return 'Cursor';
    case 'mock':
      return 'Mock';
    default:
      return provider.trim();
  }
}

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes(value?.trim().toLowerCase() ?? '');
}

/** Extracted logic identical to RuntimeConfigController.getConfig */
function getRuntimeConfig(): RuntimeConfig {
  const agentProvider = process.env.AGENT_PROVIDER?.trim() || null;
  return {
    userAvatarUrl: process.env.USER_AVATAR_URL?.trim() || null,
    userAvatarBase64: process.env.USER_AVATAR_BASE64?.trim() || null,
    assistantAvatarUrl: process.env.ASSISTANT_AVATAR_URL?.trim() || null,
    assistantAvatarBase64: process.env.ASSISTANT_AVATAR_BASE64?.trim() || null,
    agentProvider,
    agentProviderLabel: providerLabel(agentProvider),
    simplicate: truthy(process.env.SIMPLICATE),
  };
}

describe('RuntimeConfigController — getConfig logic', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.USER_AVATAR_URL = process.env.USER_AVATAR_URL;
    envBackup.USER_AVATAR_BASE64 = process.env.USER_AVATAR_BASE64;
    envBackup.ASSISTANT_AVATAR_URL = process.env.ASSISTANT_AVATAR_URL;
    envBackup.ASSISTANT_AVATAR_BASE64 = process.env.ASSISTANT_AVATAR_BASE64;
    envBackup.AGENT_PROVIDER = process.env.AGENT_PROVIDER;
    envBackup.SIMPLICATE = process.env.SIMPLICATE;
    delete process.env.USER_AVATAR_URL;
    delete process.env.USER_AVATAR_BASE64;
    delete process.env.ASSISTANT_AVATAR_URL;
    delete process.env.ASSISTANT_AVATAR_BASE64;
    delete process.env.AGENT_PROVIDER;
    delete process.env.SIMPLICATE;
  });

  afterEach(() => {
    process.env.USER_AVATAR_URL = envBackup.USER_AVATAR_URL;
    process.env.USER_AVATAR_BASE64 = envBackup.USER_AVATAR_BASE64;
    process.env.ASSISTANT_AVATAR_URL = envBackup.ASSISTANT_AVATAR_URL;
    process.env.ASSISTANT_AVATAR_BASE64 = envBackup.ASSISTANT_AVATAR_BASE64;
    process.env.AGENT_PROVIDER = envBackup.AGENT_PROVIDER;
    process.env.SIMPLICATE = envBackup.SIMPLICATE;
  });

  test('returns all nulls when no env vars are set', () => {
    expect(getRuntimeConfig()).toEqual({
      userAvatarUrl: null,
      userAvatarBase64: null,
      assistantAvatarUrl: null,
      assistantAvatarBase64: null,
      agentProvider: null,
      agentProviderLabel: null,
      simplicate: false,
    });
  });

  test('returns userAvatarUrl when USER_AVATAR_URL is set', () => {
    process.env.USER_AVATAR_URL = 'https://avatars.githubusercontent.com/u/3822576?v=4';
    expect(getRuntimeConfig().userAvatarUrl).toBe('https://avatars.githubusercontent.com/u/3822576?v=4');
  });

  test('trims whitespace from USER_AVATAR_URL', () => {
    process.env.USER_AVATAR_URL = '  https://example.com/avatar.png  ';
    expect(getRuntimeConfig().userAvatarUrl).toBe('https://example.com/avatar.png');
  });

  test('returns null when USER_AVATAR_URL is whitespace-only', () => {
    process.env.USER_AVATAR_URL = '   ';
    expect(getRuntimeConfig().userAvatarUrl).toBeNull();
  });

  test('returns userAvatarBase64 when USER_AVATAR_BASE64 is set', () => {
    process.env.USER_AVATAR_BASE64 = 'PHN2ZyAvPg==';
    expect(getRuntimeConfig().userAvatarBase64).toBe('PHN2ZyAvPg==');
  });

  test('returns assistantAvatarUrl when ASSISTANT_AVATAR_URL is set', () => {
    process.env.ASSISTANT_AVATAR_URL = 'https://example.com/bot.png';
    expect(getRuntimeConfig().assistantAvatarUrl).toBe('https://example.com/bot.png');
  });

  test('returns assistantAvatarBase64 when ASSISTANT_AVATAR_BASE64 is set', () => {
    process.env.ASSISTANT_AVATAR_BASE64 = 'aGVsbG8=';
    expect(getRuntimeConfig().assistantAvatarBase64).toBe('aGVsbG8=');
  });

  test('returns agentProvider when AGENT_PROVIDER is set', () => {
    process.env.AGENT_PROVIDER = 'gemini';
    expect(getRuntimeConfig().agentProvider).toBe('gemini');
  });

  test('returns correct shape when all env vars are set', () => {
    process.env.USER_AVATAR_URL = 'https://user.png';
    process.env.USER_AVATAR_BASE64 = 'dXNlcg==';
    process.env.ASSISTANT_AVATAR_URL = 'https://bot.png';
    process.env.ASSISTANT_AVATAR_BASE64 = 'Ym90';
    process.env.AGENT_PROVIDER = 'claude-code';
    process.env.SIMPLICATE = 'true';
    expect(getRuntimeConfig()).toEqual({
      userAvatarUrl: 'https://user.png',
      userAvatarBase64: 'dXNlcg==',
      assistantAvatarUrl: 'https://bot.png',
      assistantAvatarBase64: 'Ym90',
      agentProvider: 'claude-code',
      agentProviderLabel: 'Claude',
      simplicate: true,
    });
  });

  test('returns provider label for configured AGENT_PROVIDER', () => {
    process.env.AGENT_PROVIDER = 'openai-codex';
    expect(getRuntimeConfig().agentProvider).toBe('openai-codex');
    expect(getRuntimeConfig().agentProviderLabel).toBe('Codex');
  });

  test('trims AGENT_PROVIDER and labels Gemini', () => {
    process.env.AGENT_PROVIDER = '  gemini  ';
    expect(getRuntimeConfig().agentProvider).toBe('gemini');
    expect(getRuntimeConfig().agentProviderLabel).toBe('Gemini');
  });

  test('returns simplicate=true when SIMPLICATE is truthy', () => {
    process.env.SIMPLICATE = '1';
    expect(getRuntimeConfig().simplicate).toBe(true);
  });

  test('returns simplicate=false when SIMPLICATE is false', () => {
    process.env.SIMPLICATE = 'false';
    expect(getRuntimeConfig().simplicate).toBe(false);
  });
});
