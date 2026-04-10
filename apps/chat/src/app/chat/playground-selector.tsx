import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import type { BrowseEntry } from './use-playground-selector';

const TRIGGER_CLASS =
  'flex items-center justify-center size-8 rounded-lg border border-border bg-[var(--input-background)] text-foreground hover:border-fuchsia-500/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 transition-colors group';
const PANEL_CLASS =
  'min-w-[220px] max-w-[320px] max-h-[420px] overflow-hidden rounded-lg border border-border bg-card shadow-lg z-[100] flex flex-col p-1';
const ENTRY_CLASS_BASE =
  'w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 rounded-sm';
const PANEL_DATA_ATTR = 'data-playground-selector-panel';
const ENTRY_HOVER_CLASS = 'text-foreground hover:bg-violet-500/10 hover:text-violet-400';
const LINKED_CLASS = 'text-emerald-400 bg-emerald-500/10';

export function smartCutLabel(link: string): string {
  const segment = link.split('/').filter(Boolean).pop() ?? 'Playground';
  const dashIdx = segment.indexOf('-');
  return dashIdx !== -1 ? segment.slice(dashIdx + 1) : segment;
}

interface PlaygroundSelectorProps {
  entries: BrowseEntry[];
  loading: boolean;
  error: string | null;
  currentLink: string | null;
  linking: boolean;
  onOpen: () => void;
  onLink: (path: string) => Promise<boolean>;
  onLinked?: () => void;
  visible?: boolean;
}

export function PlaygroundSelector({
  entries,
  loading,
  error,
  currentLink,
  linking,
  onOpen,
  onLink,
  onLinked,
  visible = true,
}: PlaygroundSelectorProps) {
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<{ top: number; right: number } | null>(null);
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
      setPanelRect({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
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

  if (!visible) return null;

  return (
    <div ref={containerRef} className="relative block">
      <button
        type="button"
        onClick={handleToggle}
        className={TRIGGER_CLASS}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Link Playground"
        title="Link Playground"
      >
        <Sparkles className="size-4 shrink-0 text-fuchsia-400 group-hover:text-fuchsia-300 transition-colors" aria-hidden />
      </button>
      {open &&
        panelRect &&
        createPortal(
          <div
            data-playground-selector-panel
            className={PANEL_CLASS}
            role="listbox"
            aria-label="Playground linker"
            style={{ position: 'fixed', top: panelRect.top, right: panelRect.right }}
          >
            <div className="overflow-auto flex-1 min-h-0">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 className="size-4 animate-spin text-fuchsia-400" aria-hidden />
                  <span className="text-xs text-muted-foreground">Loading…</span>
                </div>
              )}
              {error && (
                <div className="px-3 py-4 text-xs text-destructive text-center">{error}</div>
              )}
              {!loading && !error && entries.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  No playgrounds available
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
                         <Loader2 className="size-3.5 shrink-0 animate-spin text-fuchsia-400" aria-hidden />
                      ) : (
                         <Sparkles className={`size-3.5 shrink-0 ${isLinked ? 'text-emerald-400' : 'text-fuchsia-400/50 group-hover:text-fuchsia-400'}`} aria-hidden />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </button>
                  );
                })}
            </div>

            {currentLink && (
              <div className="border-t border-border/50 mt-1 px-3 py-2 text-[10px] text-muted-foreground truncate">
                <span className="text-emerald-400 mr-1">●</span>
                Linked: <span className="text-foreground">{currentLink}</span>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
