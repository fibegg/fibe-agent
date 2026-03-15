const TRUTHY = ['1', 'true', 'yes'];

function truthy(v: string | undefined): boolean {
  return typeof v === 'string' && TRUTHY.includes(v.toLowerCase());
}

function env(): ImportMetaEnv {
  return import.meta.env;
}

export function shouldHideHeaderLogo(e?: ImportMetaEnv): boolean {
  return truthy(e?.VITE_HIDE_HEADER_LOGO ?? env().VITE_HIDE_HEADER_LOGO);
}

export type ThemeSource = 'localStorage' | 'frame';

export function getThemeSource(e?: ImportMetaEnv): ThemeSource {
  const v = e?.VITE_THEME_SOURCE ?? env().VITE_THEME_SOURCE;
  return v === 'frame' ? 'frame' : 'localStorage';
}

export function shouldHideThemeSwitch(e?: ImportMetaEnv): boolean {
  return truthy(e?.VITE_HIDE_THEME_SWITCH ?? env().VITE_HIDE_THEME_SWITCH);
}
