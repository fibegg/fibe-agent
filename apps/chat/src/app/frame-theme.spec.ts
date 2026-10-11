import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTheme, setStoredTheme } from './theme';

vi.mock('./embed-config', () => ({ getThemeSource: () => 'frame' }));

beforeEach(() => {
  localStorage.removeItem('chat-theme');
  vi.stubGlobal('parent', {});
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('embedded theme synchronization', () => {
  it.each([
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const)(
    'adopts parent %s over cached child %s and follows subsequent changes',
    (parentTheme, childTheme) => {
      setStoredTheme(childTheme);
      initTheme();
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { action: 'set_theme', theme: parentTheme },
        }),
      );
      expect(document.documentElement.dataset.theme).toBe(parentTheme);
      expect(localStorage.getItem('chat-theme')).toBe(parentTheme);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { action: 'set_theme', theme: childTheme },
        }),
      );
      expect(document.documentElement.dataset.theme).toBe(childTheme);
    },
  );
});
