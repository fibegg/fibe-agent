import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { getEffectiveTheme, onThemeChanged, setStoredTheme, THEME_OPTIONS, type Theme } from './theme';
import { useT } from './i18n';

export function ThemeSelector() {
  const t = useT();
  const [theme, setTheme] = useState<Theme>(() => getEffectiveTheme());

  useEffect(() => onThemeChanged(() => setTheme(getEffectiveTheme())), []);

  const selectTheme = (next: Theme) => {
    setStoredTheme(next);
    setTheme(next);
  };

  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label={t('theme.selector')}>
      {THEME_OPTIONS.map((option) => {
        const selected = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => selectTheme(option.value)}
            className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              selected
                ? 'border-primary/60 bg-accent text-accent-foreground'
                : 'border-border/40 bg-background/35 text-foreground hover:border-primary/40 hover:bg-accent/60'
            }`}
          >
            <span
              className="size-3 shrink-0 rounded-full border border-border/40"
              style={{ backgroundColor: option.accent }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{t(option.labelKey)}</span>
            {selected && <Check className="size-3.5 shrink-0" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
