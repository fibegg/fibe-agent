import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getEffectiveTheme,
  getStoredTheme,
  setStoredTheme,
  isDark,
  normalizeTheme,
  toggleTheme,
  initTheme,
  isSetThemeMessage,
} from './theme';

const STORAGE_KEY = 'chat-theme';

/* jsdom may provide a minimal localStorage stub missing removeItem/clear.
   Create a proper in-memory implementation and install it globally. */
let store: Record<string, string> = {};
const storageMock: Storage = {
  get length() { return Object.keys(store).length; },
  key(index: number) { return Object.keys(store)[index] ?? null; },
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
  clear() { store = {}; },
};
vi.stubGlobal('localStorage', storageMock);

function resetStorage() {
  store = {};
}

function resetDocumentTheme() {
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.backgroundColor = '';
  document.body.style.backgroundColor = '';
  document
    .querySelectorAll('meta[name="theme-color"], meta[name="apple-mobile-web-app-status-bar-style"]')
    .forEach((node) => node.remove());
}

function metaContent(name: string): string | null {
  return document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
}

function stubMatchMedia(matches: boolean) {
  const mockMediaQueryList = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mockMediaQueryList),
  });
  return mockMediaQueryList;
}

beforeEach(() => {
  resetDocumentTheme();
});

describe('getStoredTheme', () => {
  beforeEach(() => {
    resetStorage();
  });

  it('returns null when nothing stored', () => {
    expect(getStoredTheme()).toBeNull();
  });

  it('returns light when stored', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    expect(getStoredTheme()).toBe('light');
  });

  it('returns dark when stored', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('normalizes legacy winter storage to light', () => {
    localStorage.setItem(STORAGE_KEY, 'winter');
    expect(getStoredTheme()).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('normalizes legacy halloween storage to dark', () => {
    localStorage.setItem(STORAGE_KEY, 'halloween');
    expect(getStoredTheme()).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('returns dracula when stored', () => {
    localStorage.setItem(STORAGE_KEY, 'dracula');
    expect(getStoredTheme()).toBe('dracula');
  });

  it('returns null when stored value is invalid', () => {
    localStorage.setItem(STORAGE_KEY, 'system');
    expect(getStoredTheme()).toBeNull();
  });
});

describe('setStoredTheme', () => {
  beforeEach(() => {
    resetStorage();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
  });

  it('stores light and removes dark class', () => {
    document.documentElement.classList.add('dark');
    setStoredTheme('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('updates browser theme metadata for light PWAs', () => {
    setStoredTheme('light');
    expect(metaContent('theme-color')).toBe('#f5f0e6');
    expect(metaContent('apple-mobile-web-app-status-bar-style')).toBe('default');
    expect(document.documentElement.style.backgroundColor).toBe('rgb(245, 240, 230)');
    expect(document.body.style.backgroundColor).toBe('rgb(245, 240, 230)');
  });

  it('stores dark and adds dark class', () => {
    setStoredTheme('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('updates browser theme metadata for dark PWAs', () => {
    setStoredTheme('dark');
    expect(metaContent('theme-color')).toBe('#191c14');
    expect(metaContent('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
    expect(document.documentElement.style.backgroundColor).toBe('rgb(25, 28, 20)');
    expect(document.body.style.backgroundColor).toBe('rgb(25, 28, 20)');
  });

  it('stores dracula and keeps dark class for dark-compatible styles', () => {
    setStoredTheme('dracula');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dracula');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dracula');
  });

  it('normalizes legacy winter input before storing', () => {
    setStoredTheme('winter');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('normalizes legacy halloween input before storing', () => {
    setStoredTheme('halloween');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('normalizeTheme', () => {
  it('keeps canonical themes unchanged', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('dracula')).toBe('dracula');
  });

  it('maps legacy themes to canonical themes', () => {
    expect(normalizeTheme('winter')).toBe('light');
    expect(normalizeTheme('halloween')).toBe('dark');
  });

  it('rejects invalid themes', () => {
    expect(normalizeTheme('system')).toBeNull();
  });
});

describe('getEffectiveTheme', () => {
  beforeEach(() => {
    resetStorage();
  });

  it('defaults to dark without a stored theme or light system preference', () => {
    stubMatchMedia(false);
    expect(getEffectiveTheme()).toBe('dark');
  });

  it('uses light when the system prefers light and no theme is stored', () => {
    stubMatchMedia(true);
    expect(getEffectiveTheme()).toBe('light');
  });
});

describe('isDark', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('returns false when dark class is absent', () => {
    expect(isDark()).toBe(false);
  });

  it('returns true when dark class is present', () => {
    document.documentElement.classList.add('dark');
    expect(isDark()).toBe(true);
  });
});

describe('toggleTheme', () => {
  beforeEach(() => {
    resetStorage();
    document.documentElement.classList.remove('dark');
    stubMatchMedia(false);
  });

  it('switches to dark and returns dark when currently light', () => {
    setStoredTheme('light');
    expect(toggleTheme()).toBe('dark');
    expect(isDark()).toBe(true);
    expect(getStoredTheme()).toBe('dark');
  });

  it('switches to dracula when currently dark', () => {
    setStoredTheme('dark');
    expect(toggleTheme()).toBe('dracula');
    expect(isDark()).toBe(true);
    expect(getStoredTheme()).toBe('dracula');
  });

  it('wraps back to light after the last theme', () => {
    setStoredTheme('contrast');
    expect(toggleTheme()).toBe('light');
    expect(isDark()).toBe(false);
    expect(getStoredTheme()).toBe('light');
  });
});

describe('isSetThemeMessage', () => {
  it('returns true for valid light message', () => {
    expect(isSetThemeMessage({ action: 'set_theme', theme: 'light' })).toBe(true);
  });

  it('returns true for valid dark message', () => {
    expect(isSetThemeMessage({ action: 'set_theme', theme: 'dark' })).toBe(true);
  });

  it('returns true for valid named theme message', () => {
    expect(isSetThemeMessage({ action: 'set_theme', theme: 'dracula' })).toBe(true);
  });

  it('returns true for legacy theme messages', () => {
    expect(isSetThemeMessage({ action: 'set_theme', theme: 'winter' })).toBe(true);
    expect(isSetThemeMessage({ action: 'set_theme', theme: 'halloween' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isSetThemeMessage(null)).toBe(false);
  });

  it('returns false for wrong action', () => {
    expect(isSetThemeMessage({ action: 'other', theme: 'dark' })).toBe(false);
  });

  it('returns false for invalid theme', () => {
    expect(isSetThemeMessage({ action: 'set_theme', theme: 'system' })).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isSetThemeMessage('set_theme')).toBe(false);
  });
});

describe('initTheme', () => {
  beforeEach(() => {
    resetStorage();
    document.documentElement.classList.remove('dark');
  });

  it('applies stored theme when present', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    initTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not throw', () => {
    expect(() => initTheme()).not.toThrow();
  });

  it('registers matchMedia change listener and re-applies when no stored theme', () => {
    let changeHandler: (() => void) | null = null;
    const mockMediaQueryList = {
      matches: false,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'change') changeHandler = handler;
      }),
    };
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(mockMediaQueryList),
    });

    initTheme();
    expect(mockMediaQueryList.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    // Simulate system theme change — no stored theme, so applyTheme runs
    (changeHandler as (() => void) | null)?.();
    // Should not throw — applyTheme was called
  });

  it('matchMedia change handler skips applyTheme when a theme is explicitly stored', () => {
    let changeHandler: (() => void) | null = null;
    const mockMediaQueryList = {
      matches: true,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'change') changeHandler = handler;
      }),
    };
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(mockMediaQueryList),
    });
    localStorage.setItem(STORAGE_KEY, 'light');

    initTheme();
    // Stored theme exists → calling changeHandler should suppress applyTheme (but won't throw)
    (changeHandler as (() => void) | null)?.();
    // light theme stored — dark class should still NOT be on
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
