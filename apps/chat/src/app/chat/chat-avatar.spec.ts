import { describe, it, expect, vi, afterEach } from 'vitest';

describe('chat-avatar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  // USER avatar —————————————————————————————————————————————

  it('USER_AVATAR_URL is undefined when both globals are empty', async () => {
    vi.stubGlobal('__USER_AVATAR_URL__', '');
    vi.stubGlobal('__USER_AVATAR_BASE64__', '');
    const { USER_AVATAR_URL } = await import('./chat-avatar');
    expect(USER_AVATAR_URL).toBeUndefined();
  });

  it('USER_AVATAR_URL is undefined when base64 is whitespace-only', async () => {
    vi.stubGlobal('__USER_AVATAR_URL__', '');
    vi.stubGlobal('__USER_AVATAR_BASE64__', '   ');
    const { USER_AVATAR_URL } = await import('./chat-avatar');
    expect(USER_AVATAR_URL).toBeUndefined();
  });

  it('USER_AVATAR_URL returns trimmed plain URL', async () => {
    vi.stubGlobal('__USER_AVATAR_URL__', '  https://example.com/me.png  ');
    vi.stubGlobal('__USER_AVATAR_BASE64__', '');
    const { USER_AVATAR_URL } = await import('./chat-avatar');
    expect(USER_AVATAR_URL).toBe('https://example.com/me.png');
  });

  it('USER_AVATAR_URL wraps base64 as data URI', async () => {
    vi.stubGlobal('__USER_AVATAR_URL__', '');
    vi.stubGlobal('__USER_AVATAR_BASE64__', 'PHN2ZyAvPg==');
    const { USER_AVATAR_URL } = await import('./chat-avatar');
    expect(USER_AVATAR_URL).toBe('data:image/svg+xml;base64,PHN2ZyAvPg==');
  });

  it('USER_AVATAR_BASE64 takes priority over USER_AVATAR_URL', async () => {
    vi.stubGlobal('__USER_AVATAR_URL__', 'https://example.com/me.png');
    vi.stubGlobal('__USER_AVATAR_BASE64__', 'PHN2ZyAvPg==');
    const { USER_AVATAR_URL } = await import('./chat-avatar');
    expect(USER_AVATAR_URL).toBe('data:image/svg+xml;base64,PHN2ZyAvPg==');
  });

  // ASSISTANT avatar —————————————————————————————————————————

  it('ASSISTANT_AVATAR_URL is undefined when both globals are empty', async () => {
    vi.stubGlobal('__ASSISTANT_AVATAR_URL__', '');
    vi.stubGlobal('__ASSISTANT_AVATAR_BASE64__', '');
    const { ASSISTANT_AVATAR_URL } = await import('./chat-avatar');
    expect(ASSISTANT_AVATAR_URL).toBeUndefined();
  });

  it('ASSISTANT_AVATAR_URL is undefined when base64 is whitespace-only', async () => {
    vi.stubGlobal('__ASSISTANT_AVATAR_URL__', '');
    vi.stubGlobal('__ASSISTANT_AVATAR_BASE64__', '   ');
    const { ASSISTANT_AVATAR_URL } = await import('./chat-avatar');
    expect(ASSISTANT_AVATAR_URL).toBeUndefined();
  });

  it('ASSISTANT_AVATAR_URL returns trimmed plain URL', async () => {
    vi.stubGlobal('__ASSISTANT_AVATAR_URL__', ' https://example.com/bot.png ');
    vi.stubGlobal('__ASSISTANT_AVATAR_BASE64__', '');
    const { ASSISTANT_AVATAR_URL } = await import('./chat-avatar');
    expect(ASSISTANT_AVATAR_URL).toBe('https://example.com/bot.png');
  });

  it('ASSISTANT_AVATAR_URL wraps base64 as data URI', async () => {
    vi.stubGlobal('__ASSISTANT_AVATAR_URL__', '');
    vi.stubGlobal('__ASSISTANT_AVATAR_BASE64__', 'PHN2ZyAvPg==');
    const { ASSISTANT_AVATAR_URL } = await import('./chat-avatar');
    expect(ASSISTANT_AVATAR_URL).toBe('data:image/svg+xml;base64,PHN2ZyAvPg==');
  });

  it('ASSISTANT_AVATAR_BASE64 takes priority over ASSISTANT_AVATAR_URL', async () => {
    vi.stubGlobal('__ASSISTANT_AVATAR_URL__', 'https://example.com/bot.png');
    vi.stubGlobal('__ASSISTANT_AVATAR_BASE64__', 'PHN2ZyAvPg==');
    const { ASSISTANT_AVATAR_URL } = await import('./chat-avatar');
    expect(ASSISTANT_AVATAR_URL).toBe('data:image/svg+xml;base64,PHN2ZyAvPg==');
  });
});
