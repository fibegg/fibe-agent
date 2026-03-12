const STORAGE_KEY = 'chat-theme';

export type Theme = 'light' | 'dark';

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const s = localStorage.getItem(STORAGE_KEY);
  return s === 'light' || s === 'dark' ? (s as Theme) : null;
}

function prefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  const m = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)');
  return m ? m.matches : false;
}

function getEffectiveDark(): boolean {
  const stored = getStoredTheme();
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return prefersDark();
}

function applyTheme(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', getEffectiveDark());
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme();
}

export function isDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

export function toggleTheme(): Theme {
  const next: Theme = isDark() ? 'light' : 'dark';
  setStoredTheme(next);
  return next;
}

export function initTheme(): void {
  if (typeof window === 'undefined') return;
  applyTheme();
  const m = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)');
  if (m) m.addEventListener('change', () => {
    if (getStoredTheme() === null) applyTheme();
  });
}
