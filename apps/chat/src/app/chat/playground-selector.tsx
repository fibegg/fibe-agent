import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Folder, FolderOpen, ArrowLeft, Home, Link2, Loader2 } from 'lucide-react';
import type { BrowseEntry } from './use-playground-selector';

const TRIGGER_CLASS =
  'hidden md:flex items-center gap-1.5 min-w-0 max-w-[200px] h-8 px-3 rounded-lg border border-border bg-[var(--input-background)] text-[10px] sm:text-xs text-foreground hover:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-colors';
const PANEL_CLASS =
  'min-w-[280px] max-w-[420px] max-h-[420px] overflow-hidden rounded-lg border border-border bg-card shadow-lg z-[100] flex flex-col';
const ENTRY_CLASS_BASE =
  'w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 rounded-sm';
const PANEL_DATA_ATTR = 'data-playground-selector-panel';
const ENTRY_HOVER_CLASS = 'text-foreground hover:bg-violet-500/10 hover:text-violet-400';
const LINKED_CLASS = 'text-emerald-400 bg-emerald-500/10';

interface PlaygroundSelectorProps {
  entries: BrowseEntry[];
  loading: boolean;
  error: string | null;
  currentLink: string | null;
  linking: boolean;
  canGoBack: boolean;
  breadcrumbs: string[];
  onOpen: () => void;
  onBrowse: (path: string) => void;
  onGoBack: () => void;
  onGoToRoot: () => void;
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
  canGoBack,
  breadcrumbs,
  onOpen,
  onBrowse,
  onGoBack,
  onGoToRoot,
  onLink,
  onLinked,
  visible = true,
}: PlaygroundSelectorProps) {
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayLabel = currentLink
    ? currentLink.split('/').filter(Boolean).pop() ?? 'Playground'
    : 'Select Playground';

  useEffect(() => {
    if (!open) {
      setPanelRect(null);
      return;
    }
    const el = containerRef.current;
    if (el) {
      const updateRect = () => {
        const r = el.getBoundingClientRect();
        setPanelRect({ top: r.bottom + 6, left: r.left });
      };
      updateRect();
      window.addEventListener('scroll', updateRect, true);
      window.addEventListener('resize', updateRect);
      return () => {
        window.removeEventListener('scroll', updateRect, true);
        window.removeEventListener('resize', updateRect);
      };
    }
    return;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      const target = e.target as HTMLElement;
      if (target.closest(`[${PANEL_DATA_ATTR}]`)) return;
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

  const handleEntryClick = useCallback((entry: BrowseEntry) => {
    if (entry.type === 'directory') {
      onBrowse(entry.path);
    }
  }, [onBrowse]);

  const handleLink = useCallback(async (path: string) => {
    const ok = await onLink(path);
    if (ok) {
      setOpen(false);
      onLinked?.();
    }
  }, [onLink, onLinked]);

  if (!visible) return null;

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={handleToggle}
        className={TRIGGER_CLASS}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select playground"
      >
        <Folder className="size-3.5 shrink-0 text-violet-400" aria-hidden />
        <span className="truncate flex-1 text-left">{displayLabel}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open &&
        panelRect &&
        createPortal(
          <div
            data-playground-selector-panel
            className={PANEL_CLASS}
            role="listbox"
            aria-label="Playground browser"
            style={{
              position: 'fixed',
              top: panelRect.top,
              left: panelRect.left,
            }}
          >
            {/* Toolbar: back + breadcrumbs + link button */}
            <div className="flex items-center gap-1 p-2 border-b border-border/50 shrink-0 min-w-0">
              {canGoBack && (
                <button
                  type="button"
                  onClick={onGoBack}
                  className="size-7 shrink-0 flex items-center justify-center rounded-md hover:bg-violet-500/10 transition-colors"
                  title="Go back"
                  aria-label="Go back"
                >
                  <ArrowLeft className="size-3.5 text-muted-foreground" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={onGoToRoot}
                className="size-7 shrink-0 flex items-center justify-center rounded-md hover:bg-violet-500/10 transition-colors"
                title="Go to root"
                aria-label="Go to root"
              >
                <Home className="size-3.5 text-muted-foreground" aria-hidden />
              </button>
              <div className="flex-1 min-w-0 flex items-center gap-0.5 text-[10px] text-muted-foreground truncate px-1">
                <span className="shrink-0 font-medium text-violet-400">/</span>
                {breadcrumbs.map((crumb, i) => (
                  <span key={`${crumb}-${i}`} className="flex items-center gap-0.5">
                    <ChevronRight className="size-2.5 shrink-0" aria-hidden />
                    <span className={i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}>
                      {crumb}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="overflow-auto flex-1 min-h-0">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 className="size-4 animate-spin text-violet-400" aria-hidden />
                  <span className="text-xs text-muted-foreground">Loading…</span>
                </div>
              )}
              {error && (
                <div className="px-3 py-4 text-xs text-destructive text-center">{error}</div>
              )}
              {!loading && !error && entries.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  Empty directory
                </div>
              )}
              {!loading && !error && entries.map((entry) => {
                const isLinked = currentLink === entry.path;
                return (
                  <div key={entry.path} className="flex items-center group">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isLinked}
                      onClick={() => handleEntryClick(entry)}
                      className={`${ENTRY_CLASS_BASE} flex-1 min-w-0 ${isLinked ? LINKED_CLASS : ENTRY_HOVER_CLASS}`}
                    >
                      {entry.type === 'directory' ? (
                        <FolderOpen className="size-3.5 shrink-0 text-violet-400" aria-hidden />
                      ) : (
                        <span className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate">{entry.name}</span>
                      {entry.type === 'directory' && (
                        <ChevronRight className="size-3 shrink-0 ml-auto text-muted-foreground" aria-hidden />
                      )}
                    </button>
                    {entry.type === 'directory' && (
                      <button
                        type="button"
                        onClick={() => void handleLink(entry.path)}
                        disabled={linking || isLinked}
                        className={`size-7 shrink-0 flex items-center justify-center rounded-md transition-colors mr-1 ${
                          isLinked
                            ? 'text-emerald-400 cursor-default'
                            : 'opacity-0 group-hover:opacity-100 hover:bg-violet-500/10 text-muted-foreground hover:text-violet-400'
                        } disabled:opacity-50`}
                        title={isLinked ? 'Currently linked' : 'Link this playground'}
                        aria-label={isLinked ? 'Currently linked' : `Link ${entry.name}`}
                      >
                        {linking ? (
                          <Loader2 className="size-3 animate-spin" aria-hidden />
                        ) : (
                          <Link2 className="size-3" aria-hidden />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Current link footer */}
            {currentLink && (
              <div className="border-t border-border/50 px-3 py-2 text-[10px] text-muted-foreground truncate">
                <span className="text-emerald-400 mr-1">●</span>
                Linked: <span className="text-foreground">{currentLink}</span>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
