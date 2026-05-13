import { getThemeSource } from './embed-config';

const STORAGE_KEY = 'chat-theme';
const THEME_CHANGED_EVENT = 'fibe_theme_changed';

export type Theme = 'light' | 'dark' | 'dracula' | 'midnight' | 'contrast';

export const THEMES = ['light', 'dark', 'dracula', 'midnight', 'contrast'] as const;

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
  { value: 'light', labelKey: 'theme.option.light', dark: false, accent: '#7c3aed' },
  { value: 'dark', labelKey: 'theme.option.dark', dark: true, accent: '#a78bfa' },
  { value: 'dracula', labelKey: 'theme.option.dracula', dark: true, accent: '#bd93f9' },
  { value: 'midnight', labelKey: 'theme.option.midnight', dark: true, accent: '#38bdf8' },
  { value: 'contrast', labelKey: 'theme.option.contrast', dark: true, accent: '#facc15' },
];

export function isSetThemeMessage(data: unknown): data is { action: 'set_theme'; theme: Theme } {
  const o = data as Record<string, unknown> | null;
  return (
    o !== null &&
    typeof o === 'object' &&
    o.action === 'set_theme' &&
    isTheme(o.theme)
  );
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEMES.includes(value as Theme);
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
    return isTheme(s) ? s : null;
  } catch {
    return null;
  }
}

function prefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  const m = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)');
  return m ? m.matches : false;
}

export function getEffectiveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return prefersDark() ? 'dark' : 'light';
}

function getEffectiveDark(): boolean {
  return THEME_OPTIONS.find((option) => option.value === getEffectiveTheme())?.dark ?? false;
}

function applyTheme(): void {
  if (typeof document === 'undefined') return;
  const theme = getEffectiveTheme();
  document.documentElement.classList.toggle('dark', getEffectiveDark());
  document.documentElement.dataset.theme = theme;
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage can be unavailable in restrictive embed contexts.
  }
  applyTheme();
  window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: { theme } }));
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
  const m = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)');
  if (m) m.addEventListener('change', () => {
    if (getStoredTheme() === null) applyTheme();
  });
}
