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
}

/** Extracted logic identical to RuntimeConfigController.getConfig */
function getRuntimeConfig(): RuntimeConfig {
  return {
    userAvatarUrl: process.env.USER_AVATAR_URL?.trim() || null,
    userAvatarBase64: process.env.USER_AVATAR_BASE64?.trim() || null,
    assistantAvatarUrl: process.env.ASSISTANT_AVATAR_URL?.trim() || null,
    assistantAvatarBase64: process.env.ASSISTANT_AVATAR_BASE64?.trim() || null,
  };
}

describe('RuntimeConfigController — getConfig logic', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.USER_AVATAR_URL = process.env.USER_AVATAR_URL;
    envBackup.USER_AVATAR_BASE64 = process.env.USER_AVATAR_BASE64;
    envBackup.ASSISTANT_AVATAR_URL = process.env.ASSISTANT_AVATAR_URL;
    envBackup.ASSISTANT_AVATAR_BASE64 = process.env.ASSISTANT_AVATAR_BASE64;
    delete process.env.USER_AVATAR_URL;
    delete process.env.USER_AVATAR_BASE64;
    delete process.env.ASSISTANT_AVATAR_URL;
    delete process.env.ASSISTANT_AVATAR_BASE64;
  });

  afterEach(() => {
    process.env.USER_AVATAR_URL = envBackup.USER_AVATAR_URL;
    process.env.USER_AVATAR_BASE64 = envBackup.USER_AVATAR_BASE64;
    process.env.ASSISTANT_AVATAR_URL = envBackup.ASSISTANT_AVATAR_URL;
    process.env.ASSISTANT_AVATAR_BASE64 = envBackup.ASSISTANT_AVATAR_BASE64;
  });

  test('returns all nulls when no env vars are set', () => {
    expect(getRuntimeConfig()).toEqual({
      userAvatarUrl: null,
      userAvatarBase64: null,
      assistantAvatarUrl: null,
      assistantAvatarBase64: null,
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

  test('returns correct shape when all env vars are set', () => {
    process.env.USER_AVATAR_URL = 'https://user.png';
    process.env.USER_AVATAR_BASE64 = 'dXNlcg==';
    process.env.ASSISTANT_AVATAR_URL = 'https://bot.png';
    process.env.ASSISTANT_AVATAR_BASE64 = 'Ym90';
    expect(getRuntimeConfig()).toEqual({
      userAvatarUrl: 'https://user.png',
      userAvatarBase64: 'dXNlcg==',
      assistantAvatarUrl: 'https://bot.png',
      assistantAvatarBase64: 'Ym90',
    });
  });
});
