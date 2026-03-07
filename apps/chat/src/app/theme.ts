const STORAGE_KEY = 'chat-theme';

export type Theme = 'light' | 'dark';

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'light';
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

export function toggleTheme(): Theme {
  const next: Theme = isDark() ? 'light' : 'dark';
  setStoredTheme(next);
  return next;
}
