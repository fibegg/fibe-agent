import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStoredTheme,
  setStoredTheme,
  isDark,
  toggleTheme,
  initTheme,
} from './theme';

const STORAGE_KEY = 'chat-theme';

describe('getStoredTheme', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
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
    localStorage.removeItem(STORAGE_KEY);
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
    localStorage.removeItem(STORAGE_KEY);
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

describe('initTheme', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
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
