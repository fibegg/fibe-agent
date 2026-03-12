import { useState, useEffect } from 'react';
import { getStoredTheme, isDark, toggleTheme as doToggle } from './theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    setDark(isDark());
    const m = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)');
    if (!m) return;
    const handler = () => {
      if (getStoredTheme() === null) setDark(isDark());
    };
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }, []);

  const handleClick = () => {
    doToggle();
    setDark(isDark());
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="size-7 sm:size-8 flex items-center justify-center rounded-md text-violet-400 hover:text-violet-500 hover:bg-violet-500/10 transition-colors"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? (
        <SunIcon className="size-3.5 sm:size-4" />
      ) : (
        <MoonIcon className="size-3.5 sm:size-4" />
      )}
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}
