const TRUTHY = ['1', 'true', 'yes'];

function truthy(v: string | undefined): boolean {
  return typeof v === 'string' && TRUTHY.includes(v.toLowerCase());
}

function env(): ImportMetaEnv {
  return import.meta.env;
}

export type ThemeSource = 'localStorage' | 'frame';
export type LocaleSource = 'localStorage' | 'frame';

export function isStandaloneMode(): boolean {
  return typeof window === 'undefined' || window === window.parent;
}

export function getThemeSource(e?: ImportMetaEnv): ThemeSource {
  const v = e?.VITE_THEME_SOURCE ?? env().VITE_THEME_SOURCE;
  if (v === 'frame' || v === 'localStorage') return v;
  if (!isStandaloneMode()) return 'frame';
  return 'localStorage';
}

export function shouldHideThemeSwitch(e?: ImportMetaEnv): boolean {
  const v = e?.VITE_HIDE_THEME_SWITCH ?? env().VITE_HIDE_THEME_SWITCH;
  if (v !== undefined) return truthy(v);
  return !isStandaloneMode();
}

export function getLocaleSource(e?: ImportMetaEnv): LocaleSource {
  const v = e?.VITE_LOCALE_SOURCE ?? env().VITE_LOCALE_SOURCE;
  if (v === 'frame' || v === 'localStorage') return v;
  if (!isStandaloneMode()) return 'frame';
  return 'localStorage';
}

export function shouldHideLocaleSelector(e?: ImportMetaEnv): boolean {
  const v = e?.VITE_HIDE_LOCALE_SELECTOR ?? env().VITE_HIDE_LOCALE_SELECTOR;
  if (v !== undefined) return truthy(v);
  return !isStandaloneMode();
}
