import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Languages } from 'lucide-react';
import { shouldHideLocaleSelector } from './embed-config';
import { LOCALES, LOCALE_OPTIONS, localeLabel, useI18n, type Locale } from './i18n';
import { BUTTON_ICON_ACCENT_SM } from './ui-classes';

export function LocaleSelector({ variant = 'icon' }: { variant?: 'icon' | 'menu' | 'row' | 'stark' }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
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

  useEffect(() => {
    if (!open || variant === 'menu' || variant === 'row') return;

    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;

      const gap = 8;
      const width = 176;
      const menuHeight = menuRef.current?.offsetHeight ?? 160;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const left = Math.min(
        Math.max(gap, rect.right - width),
        Math.max(gap, viewportWidth - width - gap),
      );
      const opensAbove = rect.bottom + gap + menuHeight > viewportHeight - gap && rect.top > menuHeight + gap;
      const top = opensAbove ? rect.top - menuHeight - gap : rect.bottom + gap;

      setMenuStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxHeight: `min(16rem, calc(100dvh - ${gap * 2}px))`,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, variant]);

  if (shouldHideLocaleSelector()) return null;

  const selectLocale = (next: Locale) => {
    setLocale(next);
    setOpen(false);
  };

  const renderDropdown = (tone: 'default' | 'stark') => {
    if (!open) return null;
    const style = menuStyle ?? {
      position: 'fixed',
      top: 0,
      left: 0,
      width: 176,
      visibility: 'hidden',
    } satisfies CSSProperties;

    return createPortal(
      <div
        ref={menuRef}
        role="menu"
        aria-label={t('locale.selector')}
        className={
          tone === 'stark'
            ? 'z-[300] overflow-y-auto rounded-sm border border-cyan-500/60 bg-slate-950/95 p-1 shadow-[0_0_20px_rgba(6,182,212,0.25)] backdrop-blur-md'
            : 'z-[300] overflow-y-auto rounded-lg border border-border bg-card/95 p-1.5 shadow-xl shadow-black/30 backdrop-blur-xl'
        }
        style={style}
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
              className={
                tone === 'stark'
                  ? `flex h-8 w-full items-center justify-between gap-3 rounded-sm px-2.5 text-left font-mono text-xs uppercase tracking-wider transition-colors ${
                      option === locale
                        ? 'bg-cyan-500/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]'
                        : 'text-cyan-500 hover:bg-cyan-500/10 hover:text-cyan-200'
                    }`
                  : `flex h-8 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-sm transition-colors ${
                      option === locale
                        ? 'bg-primary/15 text-primary'
                        : 'text-foreground hover:bg-primary/10 hover:text-primary'
                    }`
              }
            >
              <span className="min-w-0 truncate">{localeLabel(option)}</span>
              <span className={tone === 'stark' ? 'shrink-0 text-[10px] text-cyan-700' : 'shrink-0 text-xs text-muted-foreground'}>
                {optionMeta.shortLabel}
              </span>
            </button>
          );
        })}
      </div>,
      document.body,
    );
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
                    ? 'border-primary/60 bg-primary/20 text-primary'
                    : 'border-border/50 bg-background/40 text-muted-foreground hover:bg-primary/10 hover:text-foreground'
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
                  option === locale ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
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

  if (variant === 'stark') {
    return (
      <div className="relative shrink-0" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="grid size-8 place-items-center rounded border border-cyan-800/70 bg-cyan-950/60 text-cyan-400 transition-colors hover:border-cyan-400 hover:bg-cyan-900/60 hover:text-cyan-200"
          aria-label={t('locale.selector')}
          aria-haspopup="menu"
          aria-expanded={open}
          title={t('locale.current', { locale: localeLabel(locale) })}
        >
          <Languages className="size-4" aria-hidden />
          <span className="sr-only">{t('common.language')}</span>
        </button>
        {renderDropdown('stark')}
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
      {renderDropdown('default')}
    </div>
  );
}
