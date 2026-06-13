import { useState, useEffect } from 'react';
import { Moon, Palette, Sun } from 'lucide-react';
import { getEffectiveTheme, getStoredTheme, onThemeChanged, THEME_OPTIONS, toggleTheme as doToggle } from './theme';
import { BUTTON_ICON_ACCENT_SM } from './ui-classes';
import { useT } from './i18n';

export function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState(() => getEffectiveTheme());

  useEffect(() => {
    const sync = () => setTheme(getEffectiveTheme());
    sync();
    const offTheme = onThemeChanged(sync);
    const m = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      if (getStoredTheme() === null) sync();
    };
    if (m && typeof m.addEventListener === 'function') m.addEventListener('change', handler);
    return () => {
      offTheme();
      if (m && typeof m.removeEventListener === 'function') m.removeEventListener('change', handler);
    };
  }, []);

  const handleClick = () => {
    setTheme(doToggle());
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={BUTTON_ICON_ACCENT_SM}
      aria-label={t('theme.next')}
      title={t('theme.current', { theme: t(THEME_OPTIONS.find((option) => option.value === theme)?.labelKey ?? 'theme.option.light') })}
    >
      {theme === 'light' ? (
        <Sun className="size-3.5 sm:size-4" />
      ) : theme === 'dark' ? (
        <Moon className="size-3.5 sm:size-4" />
      ) : (
        <Palette className="size-3.5 sm:size-4" />
      )}
    </button>
  );
}
