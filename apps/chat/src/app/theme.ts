import { getThemeSource } from './embed-config';

const STORAGE_KEY = 'chat-theme';
const THEME_CHANGED_EVENT = 'fibe_theme_changed';
let transientTheme: Theme | null = null;

export type Theme = 'light' | 'dark';
export type LegacyTheme =
  | 'winter'
  | 'halloween'
  | 'dracula'
  | 'midnight'
  | 'contrast';
export type ThemeInput = Theme | LegacyTheme;

export const THEMES = ['light', 'dark'] as const;
const LEGACY_THEME_ALIASES: Record<LegacyTheme, Theme> = {
  winter: 'light',
  halloween: 'dark',
  dracula: 'dark',
  midnight: 'dark',
  contrast: 'dark',
};
const PWA_THEME_COLORS: Record<Theme, string> = {
  light: '#fafafa',
  dark: '#09090b',
};
const PWA_STATUS_BAR_STYLES: Record<Theme, 'default' | 'black'> = {
  light: 'default',
  dark: 'black',
};

export interface ThemeOption {
  value: Theme;
  labelKey: 'theme.option.light' | 'theme.option.dark';
  dark: boolean;
  accent: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    labelKey: 'theme.option.light',
    dark: false,
    accent: '#18181b',
  },
  {
    value: 'dark',
    labelKey: 'theme.option.dark',
    dark: true,
    accent: '#fafafa',
  },
];

export function isSetThemeMessage(
  data: unknown,
): data is { action: 'set_theme'; theme: ThemeInput } {
  const o = data as Record<string, unknown> | null;
  return (
    o !== null &&
    typeof o === 'object' &&
    o.action === 'set_theme' &&
    normalizeTheme(o.theme) !== null
  );
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEMES.includes(value as Theme);
}

export function normalizeTheme(value: unknown): Theme | null {
  if (isTheme(value)) return value;
  if (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(LEGACY_THEME_ALIASES, value)
  ) {
    return LEGACY_THEME_ALIASES[value as LegacyTheme];
  }
  return null;
}

function initFrameThemeListener(): void {
  if (typeof window === 'undefined' || window === window.parent) return;
  if (getThemeSource() !== 'frame') return;
  window.addEventListener('message', (event: MessageEvent) => {
    if (!isSetThemeMessage(event.data)) return;
    setStoredTheme(event.data.theme);
  });
}

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    const theme = normalizeTheme(s);
    if (theme && s !== theme) localStorage.setItem(STORAGE_KEY, theme);
    return theme;
  } catch {
    return transientTheme;
  }
}

function prefersLight(): boolean {
  if (typeof window === 'undefined') return false;
  const m =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)');
  return m ? m.matches : false;
}

export function getEffectiveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return prefersLight() ? 'light' : 'dark';
}

function setMetaContent(name: string, content: string): void {
  let meta = document.head.querySelector<HTMLMetaElement>(
    `meta[name="${name}"]`,
  );
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', name);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function applyBrowserTheme(theme: Theme): void {
  const color = PWA_THEME_COLORS[theme];
  document.documentElement.style.backgroundColor = color;
  if (document.body) document.body.style.backgroundColor = color;
  setMetaContent('theme-color', color);
  setMetaContent(
    'apple-mobile-web-app-status-bar-style',
    PWA_STATUS_BAR_STYLES[theme],
  );
}

function applyTheme(theme: Theme = getEffectiveTheme()): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.theme = theme;
  applyBrowserTheme(theme);
  window.dispatchEvent(
    new CustomEvent(THEME_CHANGED_EVENT, { detail: { theme } }),
  );
}

export function setStoredTheme(theme: ThemeInput): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeTheme(theme);
  if (!normalized) return;
  transientTheme = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // localStorage can be unavailable in restrictive embed contexts.
  }
  applyTheme(normalized);
}

export function isDark(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  );
}

export function toggleTheme(): Theme {
  const current = getEffectiveTheme();
  const index = THEMES.indexOf(current);
  const next = THEMES[(index + 1) % THEMES.length] ?? 'light';
  setStoredTheme(next);
  return next;
}

export function onThemeChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(THEME_CHANGED_EVENT, listener);
  return () => window.removeEventListener(THEME_CHANGED_EVENT, listener);
}

export function initTheme(): void {
  if (typeof window === 'undefined') return;
  applyTheme();
  initFrameThemeListener();
  const m =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)');
  if (m)
    m.addEventListener('change', () => {
      if (getStoredTheme() === null) applyTheme();
    });
}
