import { useEffect, useRef, useState } from 'react';
import { Languages } from 'lucide-react';
import { shouldHideLocaleSelector } from './embed-config';
import { LOCALES, LOCALE_OPTIONS, localeLabel, useI18n, type Locale } from './i18n';
import { BUTTON_ICON_ACCENT_SM } from './ui-classes';

export function LocaleSelector({ variant = 'icon' }: { variant?: 'icon' | 'menu' | 'row' }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (shouldHideLocaleSelector()) return null;

  const selectLocale = (next: Locale) => {
    setLocale(next);
    setOpen(false);
  };

  if (variant === 'menu') {
    return (
      <div className="mt-1 border-t border-border/40 px-2.5 py-2">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Languages className="size-3.5" aria-hidden />
          <span>{t('common.language')}</span>
        </div>
        <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto pr-0.5">
          {LOCALES.map((option) => {
            const optionMeta = LOCALE_OPTIONS[option];
            return (
              <button
                key={option}
                type="button"
                onClick={() => selectLocale(option)}
                className={`h-8 rounded-md border px-2 text-xs font-medium transition-colors ${
                  option === locale
                    ? 'border-violet-400/60 bg-violet-500/20 text-violet-200'
                    : 'border-border/50 bg-background/40 text-muted-foreground hover:bg-violet-500/10 hover:text-foreground'
                }`}
                aria-pressed={option === locale}
              >
                {optionMeta.shortLabel}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === 'row') {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-sm font-medium text-foreground">{t('common.language')}</span>
        <div className="inline-flex max-w-[13rem] flex-wrap rounded-lg border border-border/50 bg-background/60 p-0.5">
          {LOCALES.map((option) => {
            const optionMeta = LOCALE_OPTIONS[option];
            return (
              <button
                key={option}
                type="button"
                onClick={() => selectLocale(option)}
                className={`h-7 min-w-10 rounded-md px-2 text-xs font-semibold transition-colors ${
                  option === locale ? 'bg-violet-500 text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label={t('locale.current', { locale: localeLabel(option) })}
                aria-pressed={option === locale}
              >
                {optionMeta.shortLabel}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={BUTTON_ICON_ACCENT_SM}
        aria-label={t('locale.selector')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('locale.current', { locale: localeLabel(locale) })}
      >
        <Languages className="size-3.5 sm:size-4" aria-hidden />
        <span className="sr-only">{t('common.language')}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('locale.selector')}
          className="absolute right-0 top-full z-[100] mt-2 max-h-64 w-44 overflow-y-auto rounded-lg border border-border bg-card/95 p-1.5 shadow-xl shadow-black/30 backdrop-blur-xl"
        >
          {LOCALES.map((option) => {
            const optionMeta = LOCALE_OPTIONS[option];
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={option === locale}
                onClick={() => selectLocale(option)}
                className={`flex h-8 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-sm transition-colors ${
                  option === locale
                    ? 'bg-violet-500/15 text-violet-200'
                    : 'text-foreground hover:bg-violet-500/10 hover:text-violet-300'
                }`}
              >
                <span className="min-w-0 truncate">{localeLabel(option)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{optionMeta.shortLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
