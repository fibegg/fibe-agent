import { describe, it, expect, vi } from 'vitest';
import { resolveAvatar, loadAvatarConfig } from './chat-avatar';

describe('chat-avatar', () => {
  // resolveAvatar ————————————————————————————————————————————

  describe('resolveAvatar', () => {
    it('returns undefined when both base64 and url are null/empty', () => {
      expect(resolveAvatar(null, null)).toBeUndefined();
      expect(resolveAvatar('', '')).toBeUndefined();
      expect(resolveAvatar('  ', '  ')).toBeUndefined();
    });

    it('wraps base64 as a data URI', () => {
      expect(resolveAvatar('PHN2ZyAvPg==', null)).toBe('data:image/svg+xml;base64,PHN2ZyAvPg==');
    });

    it('trims base64 before wrapping', () => {
      expect(resolveAvatar('  PHN2ZyAvPg==  ', null)).toBe('data:image/svg+xml;base64,PHN2ZyAvPg==');
    });

    it('base64 takes priority over url', () => {
      expect(resolveAvatar('PHN2ZyAvPg==', 'https://example.com/me.png')).toBe(
        'data:image/svg+xml;base64,PHN2ZyAvPg=='
      );
    });

    it('returns trimmed url when base64 is empty', () => {
      expect(resolveAvatar('', '  https://example.com/me.png  ')).toBe('https://example.com/me.png');
    });

    it('returns undefined for whitespace-only url with empty base64', () => {
      expect(resolveAvatar('', '   ')).toBeUndefined();
    });

    it('passes through a base64 value that already has a data: prefix as-is', () => {
      const full = 'data:image/svg+xml;base64,PHN2ZyAvPg==';
      expect(resolveAvatar(full, null)).toBe(full);
    });

    it('passes through a data: URI even when url is also set', () => {
      const full = 'data:image/svg+xml;base64,PHN2ZyAvPg==';
      expect(resolveAvatar(full, 'https://example.com/fallback.png')).toBe(full);
    });
  });

  // loadAvatarConfig —————————————————————————————————————————

  describe('loadAvatarConfig', () => {
    it('returns undefined values when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
      const cfg = await loadAvatarConfig();
      expect(cfg).toEqual({ userAvatarUrl: undefined, assistantAvatarUrl: undefined });
      vi.unstubAllGlobals();
    });

    it('returns undefined values when response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const cfg = await loadAvatarConfig();
      expect(cfg).toEqual({ userAvatarUrl: undefined, assistantAvatarUrl: undefined });
      vi.unstubAllGlobals();
    });

    it('resolves userAvatarUrl from url field', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          userAvatarUrl: 'https://avatars.githubusercontent.com/u/3822576?v=4',
          userAvatarBase64: null,
          assistantAvatarUrl: null,
          assistantAvatarBase64: null,
        }),
      }));
      const cfg = await loadAvatarConfig();
      expect(cfg.userAvatarUrl).toBe('https://avatars.githubusercontent.com/u/3822576?v=4');
      expect(cfg.assistantAvatarUrl).toBeUndefined();
      vi.unstubAllGlobals();
    });

    it('resolves userAvatarUrl from base64 field (takes priority)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          userAvatarUrl: 'https://example.com/me.png',
          userAvatarBase64: 'PHN2ZyAvPg==',
          assistantAvatarUrl: null,
          assistantAvatarBase64: null,
        }),
      }));
      const cfg = await loadAvatarConfig();
      expect(cfg.userAvatarUrl).toBe('data:image/svg+xml;base64,PHN2ZyAvPg==');
      vi.unstubAllGlobals();
    });

    it('resolves both user and assistant avatar', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          userAvatarUrl: 'https://user.png',
          userAvatarBase64: null,
          assistantAvatarUrl: 'https://bot.png',
          assistantAvatarBase64: null,
        }),
      }));
      const cfg = await loadAvatarConfig();
      expect(cfg.userAvatarUrl).toBe('https://user.png');
      expect(cfg.assistantAvatarUrl).toBe('https://bot.png');
      vi.unstubAllGlobals();
    });
  });
});
