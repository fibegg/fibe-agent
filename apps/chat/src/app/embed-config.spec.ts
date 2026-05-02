import { describe, it, expect } from 'vitest';
import { getLocaleSource, getThemeSource, shouldHideLocaleSelector, shouldHideThemeSwitch } from './embed-config';

const env = (overrides: Record<string, string | undefined> = {}): ImportMetaEnv =>
  ({ ...overrides }) as unknown as ImportMetaEnv;

describe('getThemeSource', () => {
  it('returns localStorage when env is empty', () => {
    expect(getThemeSource(env())).toBe('localStorage');
  });

  it('returns localStorage when VITE_THEME_SOURCE is not frame', () => {
    expect(getThemeSource(env({ VITE_THEME_SOURCE: 'localStorage' }))).toBe('localStorage');
  });

  it('returns frame when VITE_THEME_SOURCE is frame', () => {
    expect(getThemeSource(env({ VITE_THEME_SOURCE: 'frame' }))).toBe('frame');
  });
});

describe('shouldHideThemeSwitch', () => {
  it('returns false when env is empty', () => {
    expect(shouldHideThemeSwitch(env())).toBe(false);
  });

  it('returns true when VITE_HIDE_THEME_SWITCH is 1', () => {
    expect(shouldHideThemeSwitch(env({ VITE_HIDE_THEME_SWITCH: '1' }))).toBe(true);
  });

  it('returns true when VITE_HIDE_THEME_SWITCH is true', () => {
    expect(shouldHideThemeSwitch(env({ VITE_HIDE_THEME_SWITCH: 'true' }))).toBe(true);
  });
});

describe('getLocaleSource', () => {
  it('returns localStorage when env is empty', () => {
    expect(getLocaleSource(env())).toBe('localStorage');
  });

  it('returns localStorage when VITE_LOCALE_SOURCE is not frame', () => {
    expect(getLocaleSource(env({ VITE_LOCALE_SOURCE: 'localStorage' }))).toBe('localStorage');
  });

  it('returns frame when VITE_LOCALE_SOURCE is frame', () => {
    expect(getLocaleSource(env({ VITE_LOCALE_SOURCE: 'frame' }))).toBe('frame');
  });
});

describe('shouldHideLocaleSelector', () => {
  it('returns false when env is empty', () => {
    expect(shouldHideLocaleSelector(env())).toBe(false);
  });

  it('returns true when VITE_HIDE_LOCALE_SELECTOR is 1', () => {
    expect(shouldHideLocaleSelector(env({ VITE_HIDE_LOCALE_SELECTOR: '1' }))).toBe(true);
  });

  it('returns true when VITE_HIDE_LOCALE_SELECTOR is true', () => {
    expect(shouldHideLocaleSelector(env({ VITE_HIDE_LOCALE_SELECTOR: 'true' }))).toBe(true);
  });
});
