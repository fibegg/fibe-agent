import { describe, it, expect } from 'vitest';
import {
  shouldHideHeaderLogo,
  getThemeSource,
  shouldHideThemeSwitch,
} from './embed-config';

const env = (overrides: Record<string, string | undefined> = {}): ImportMetaEnv =>
  ({ ...overrides }) as unknown as ImportMetaEnv;

describe('shouldHideHeaderLogo', () => {
  it('returns false when env is empty', () => {
    expect(shouldHideHeaderLogo(env())).toBe(false);
  });

  it('returns true when VITE_HIDE_HEADER_LOGO is 1', () => {
    expect(shouldHideHeaderLogo(env({ VITE_HIDE_HEADER_LOGO: '1' }))).toBe(true);
  });

  it('returns true when VITE_HIDE_HEADER_LOGO is true', () => {
    expect(shouldHideHeaderLogo(env({ VITE_HIDE_HEADER_LOGO: 'true' }))).toBe(true);
  });

  it('returns true when VITE_HIDE_HEADER_LOGO is yes', () => {
    expect(shouldHideHeaderLogo(env({ VITE_HIDE_HEADER_LOGO: 'yes' }))).toBe(true);
  });

  it('returns false when VITE_HIDE_HEADER_LOGO is 0', () => {
    expect(shouldHideHeaderLogo(env({ VITE_HIDE_HEADER_LOGO: '0' }))).toBe(false);
  });
});

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
