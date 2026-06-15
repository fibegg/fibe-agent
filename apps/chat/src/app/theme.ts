import { getThemeSource } from './embed-config';

const STORAGE_KEY = 'chat-theme';
const THEME_CHANGED_EVENT = 'fibe_theme_changed';

export type Theme = 'light' | 'dark' | 'dracula' | 'midnight' | 'contrast';
export type LegacyTheme = 'winter' | 'halloween';
export type ThemeInput = Theme | LegacyTheme;

export const THEMES = ['light', 'dark', 'dracula', 'midnight', 'contrast'] as const;
const LEGACY_THEME_ALIASES: Record<LegacyTheme, Theme> = {
  winter: 'light',
  halloween: 'dark',
};
const PWA_THEME_COLORS: Record<Theme, string> = {
  light: '#f5f0e6',
  dark: '#191c14',
  dracula: '#282a36',
  midnight: '#07111f',
  contrast: '#000000',
};
const PWA_STATUS_BAR_STYLES: Record<Theme, 'default' | 'black'> = {
  light: 'default',
  dark: 'black',
  dracula: 'black',
  midnight: 'black',
  contrast: 'black',
};

export interface ThemeOption {
  value: Theme;
  labelKey:
    | 'theme.option.light'
    | 'theme.option.dark'
    | 'theme.option.dracula'
    | 'theme.option.midnight'
    | 'theme.option.contrast';
  dark: boolean;
  accent: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', labelKey: 'theme.option.light', dark: false, accent: '#5cb43a' },
  { value: 'dark', labelKey: 'theme.option.dark', dark: true, accent: '#79d44e' },
  { value: 'dracula', labelKey: 'theme.option.dracula', dark: true, accent: '#bd93f9' },
  { value: 'midnight', labelKey: 'theme.option.midnight', dark: true, accent: '#38bdf8' },
  { value: 'contrast', labelKey: 'theme.option.contrast', dark: true, accent: '#facc15' },
];

export function isSetThemeMessage(data: unknown): data is { action: 'set_theme'; theme: ThemeInput } {
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
  if (value === 'winter' || value === 'halloween') return LEGACY_THEME_ALIASES[value];
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
    return null;
  }
}

function prefersLight(): boolean {
  if (typeof window === 'undefined') return false;
  const m = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)');
  return m ? m.matches : false;
}

export function getEffectiveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return prefersLight() ? 'light' : 'dark';
}

function getEffectiveDark(): boolean {
  return THEME_OPTIONS.find((option) => option.value === getEffectiveTheme())?.dark ?? false;
}

function setMetaContent(name: string, content: string): void {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
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
  setMetaContent('apple-mobile-web-app-status-bar-style', PWA_STATUS_BAR_STYLES[theme]);
}

function applyTheme(): void {
  if (typeof document === 'undefined') return;
  const theme = getEffectiveTheme();
  document.documentElement.classList.toggle('dark', getEffectiveDark());
  document.documentElement.dataset.theme = theme;
  applyBrowserTheme(theme);
}

export function setStoredTheme(theme: ThemeInput): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeTheme(theme);
  if (!normalized) return;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // localStorage can be unavailable in restrictive embed contexts.
  }
  applyTheme();
  window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: { theme: normalized } }));
}

export function isDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
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
  const m = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)');
  if (m) m.addEventListener('change', () => {
    if (getStoredTheme() === null) applyTheme();
  });
}
