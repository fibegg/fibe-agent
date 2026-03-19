import { describe, it, expect, vi, afterEach } from 'vitest';

describe('chat-avatar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('USER_AVATAR_URL is undefined when __USER_AVATAR_URL__ is empty', async () => {
    vi.stubGlobal('__USER_AVATAR_URL__', '');
    const { USER_AVATAR_URL } = await import('./chat-avatar');
    expect(USER_AVATAR_URL).toBeUndefined();
  });

  it('USER_AVATAR_URL returns trimmed URL when set', async () => {
    vi.stubGlobal('__USER_AVATAR_URL__', '  https://example.com/me.png  ');
    const { USER_AVATAR_URL } = await import('./chat-avatar');
    expect(USER_AVATAR_URL).toBe('https://example.com/me.png');
  });

  it('ASSISTANT_AVATAR_URL is undefined when __ASSISTANT_AVATAR_URL__ is empty', async () => {
    vi.stubGlobal('__ASSISTANT_AVATAR_URL__', '');
    const { ASSISTANT_AVATAR_URL } = await import('./chat-avatar');
    expect(ASSISTANT_AVATAR_URL).toBeUndefined();
  });

  it('ASSISTANT_AVATAR_URL returns trimmed URL when set', async () => {
    vi.stubGlobal('__ASSISTANT_AVATAR_URL__', ' https://example.com/bot.png ');
    const { ASSISTANT_AVATAR_URL } = await import('./chat-avatar');
    expect(ASSISTANT_AVATAR_URL).toBe('https://example.com/bot.png');
  });
});
