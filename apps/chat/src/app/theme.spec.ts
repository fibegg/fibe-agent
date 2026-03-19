import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStoredTheme,
  setStoredTheme,
  isDark,
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

  it('returns null when stored value is invalid', () => {
    localStorage.setItem(STORAGE_KEY, 'system');
    expect(getStoredTheme()).toBeNull();
  });
});

describe('setStoredTheme', () => {
  beforeEach(() => {
    resetStorage();
    document.documentElement.classList.remove('dark');
  });

  it('stores light and removes dark class', () => {
    document.documentElement.classList.add('dark');
    setStoredTheme('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('stores dark and adds dark class', () => {
    setStoredTheme('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
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
  });

  it('switches to dark and returns dark when currently light', () => {
    setStoredTheme('light');
    expect(toggleTheme()).toBe('dark');
    expect(isDark()).toBe(true);
    expect(getStoredTheme()).toBe('dark');
  });

  it('switches to light and returns light when currently dark', () => {
    setStoredTheme('dark');
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
});
