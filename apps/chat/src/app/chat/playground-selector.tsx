import { useRef, useEffect, useState, useCallback, type SVGProps } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Unlink } from 'lucide-react';
import type { BrowseEntry } from './use-playground-selector';
import { useT } from '../i18n';

const TRIGGER_CLASS =
  'flex items-center justify-center size-8 rounded-lg border border-border bg-[var(--input-background)] text-foreground hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors group';
const MENU_TRIGGER_CLASS =
  'flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-foreground transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 group';
const PANEL_CLASS =
  'min-w-[220px] max-w-[320px] max-h-[420px] overflow-hidden rounded-lg border border-border bg-card shadow-lg z-[100] flex flex-col p-1';
const ENTRY_CLASS_BASE =
  'w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 rounded-sm';
const PANEL_DATA_ATTR = 'data-playground-selector-panel';
const ENTRY_HOVER_CLASS = 'text-foreground hover:bg-primary/10 hover:text-primary';
const LINKED_CLASS = 'text-emerald-400 bg-emerald-500/10';
const PANEL_WIDTH_PX = 320;
const PANEL_GUTTER_PX = 8;

type PanelRect = {
  top: number;
  left: number;
  maxHeight: number;
};

export function smartCutLabel(link: string): string {
  const segment = link.split('/').filter(Boolean).pop() ?? 'Playground';
  const stripped = segment.replace(/--\d+$/, '');
  return stripped || 'Playground';
}

function PlaygroundIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.75" opacity="0.4" x1="12" y1="1" x2="12" y2="23" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.75" opacity="0.4" x1="1" y1="12" x2="23" y2="12" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" x1="15" y1="4" x2="15" y2="10" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 4c1 0 3 3 6 6" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" x1="3" y1="8" x2="10" y2="5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5.5 10l1-3 1 3" />
      <circle cx="3.5" cy="7.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="5.3" r="0.7" fill="currentColor" stroke="none" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 17q3.5-3 7 0" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" x1="3.5" y1="17.5" x2="4" y2="20" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" x1="9.5" y1="17.5" x2="9" y2="20" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" x1="6.5" y1="14.5" x2="6.5" y2="13" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" x1="4.5" y1="15.5" x2="4" y2="14.5" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" x1="8.5" y1="15.5" x2="9" y2="14.5" />
      <circle strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" cx="18" cy="18" r="2.5" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" x1="18" y1="15.5" x2="18" y2="18" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" x1="18" y1="18" x2="15.8" y2="19.3" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" x1="18" y1="18" x2="20.2" y2="19.3" />
    </svg>
  );
}

interface PlaygroundSelectorProps {
  entries: BrowseEntry[];
  loading: boolean;
  error: string | null;
  currentLink: string | null;
  linking: boolean;
  unlinking?: boolean;
  onOpen: () => void;
  onLink: (path: string) => Promise<boolean>;
  onUnlink?: () => Promise<boolean>;
  onLinked?: () => void;
  onUnlinked?: () => void;
  visible?: boolean;
  variant?: 'icon' | 'menu';
}

export function PlaygroundSelector({
  entries,
  loading,
  error,
  currentLink,
  linking,
  unlinking = false,
  onOpen,
  onLink,
  onUnlink,
  onLinked,
  onUnlinked,
  visible = true,
  variant = 'icon',
}: PlaygroundSelectorProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<PanelRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPanelRect(null);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const updateRect = () => {
      const r = el.getBoundingClientRect();
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const panelWidth = Math.min(PANEL_WIDTH_PX, viewportWidth - PANEL_GUTTER_PX * 2);
      const left = Math.min(
        Math.max(PANEL_GUTTER_PX, r.left),
        Math.max(PANEL_GUTTER_PX, viewportWidth - panelWidth - PANEL_GUTTER_PX),
      );
      const top = Math.max(
        PANEL_GUTTER_PX,
        Math.min(r.bottom + 6, viewportHeight - PANEL_GUTTER_PX - 160),
      );
      setPanelRect({
        top,
        left,
        maxHeight: Math.max(80, viewportHeight - top - PANEL_GUTTER_PX),
      });
    };
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    window.visualViewport?.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
      window.visualViewport?.removeEventListener('resize', updateRect);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest(`[${PANEL_DATA_ATTR}]`)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleToggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next) onOpen();
  }, [open, onOpen]);

  const handleLink = useCallback(
    async (path: string) => {
      const ok = await onLink(path);
      if (ok) {
        setOpen(false);
        onLinked?.();
      }
    },
    [onLink, onLinked],
  );

  const handleUnlink = useCallback(async () => {
    if (!onUnlink || !window.confirm(t('playground.unlinkConfirm'))) return;
    const ok = await onUnlink();
    if (ok) onUnlinked?.();
  }, [onUnlink, onUnlinked, t]);

  if (!visible) return null;

  const triggerLabel = variant === 'menu' ? t('playground.menu') : t('playground.link');

  return (
    <div ref={containerRef} className="relative block">
      <button
        type="button"
        onClick={handleToggle}
        className={variant === 'menu' ? MENU_TRIGGER_CLASS : TRIGGER_CLASS}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerLabel}
      >
        <PlaygroundIcon className="size-4 shrink-0 text-primary group-hover:text-primary transition-colors" aria-hidden />
        {variant === 'menu' && <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>}
      </button>
      {open &&
        panelRect &&
        createPortal(
          <div
            data-playground-selector-panel
            className={PANEL_CLASS}
            role="listbox"
            aria-label={t('playground.linker')}
            style={{
              position: 'fixed',
              top: panelRect.top,
              left: panelRect.left,
              width: 'min(320px, calc(100vw - 16px))',
              maxHeight: panelRect.maxHeight,
            }}
          >
            <div className="overflow-auto flex-1 min-h-0">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                  <span className="text-xs text-muted-foreground">{t('playground.loading')}</span>
                </div>
              )}
              {error && (
                <div className="px-3 py-4 text-xs text-destructive text-center">{error}</div>
              )}
              {!loading && !error && entries.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  {t('playground.none')}
                </div>
              )}
              {!loading &&
                !error &&
                entries.map((entry) => {
                  const isLinked = currentLink === entry.path;
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      role="option"
                      aria-selected={isLinked}
                      disabled={linking || isLinked}
                      onClick={() => void handleLink(entry.path)}
                      className={`${ENTRY_CLASS_BASE} ${isLinked ? LINKED_CLASS : ENTRY_HOVER_CLASS} disabled:opacity-50`}
                    >
                      {linking ? (
                         <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
                      ) : (
                         <PlaygroundIcon className={`size-3.5 shrink-0 ${isLinked ? 'text-emerald-400' : 'text-primary/50 group-hover:text-primary'}`} aria-hidden />
                      )}
                      <span className="truncate" title={entry.name}>{smartCutLabel(entry.name)}</span>
                    </button>
                  );
                })}
            </div>

            {currentLink && (
              <div className="border-t border-border/50 mt-1 flex min-w-0 items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                  <span className="text-emerald-400 mr-1">●</span>
                  {t('playground.linked', { path: '' })}<span className="text-foreground">{smartCutLabel(currentLink)}</span>
                </div>
                {onUnlink && (
                  <button
                    type="button"
                    onClick={() => void handleUnlink()}
                    disabled={linking || unlinking}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30 disabled:opacity-50"
                    aria-label={t('playground.unlink')}
                    title={t('playground.unlink')}
                  >
                    {unlinking ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    ) : (
                      <Unlink className="size-3" aria-hidden />
                    )}
                    <span>{unlinking ? t('playground.unlinking') : t('playground.unlink')}</span>
                  </button>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
