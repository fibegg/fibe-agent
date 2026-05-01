import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RefreshCw, Loader2 } from 'lucide-react';
import { MODEL_OPTION_SELECTED } from '../ui-classes';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LABEL = 'Model (default)';
const MOBILE_BREAKPOINT_PX = 640;
const PANEL_GUTTER_PX = 8;
const PANEL_MAX_HEIGHT_PX = 384;
const PANEL_MIN_HEIGHT_PX = 160;
const PANEL_MIN_WIDTH_PX = 220;
const PANEL_MAX_WIDTH_PX = 340;

const TRIGGER_CLASS_BASE =
  'flex items-center gap-1.5 min-w-0 h-8 px-2 sm:px-3 rounded-lg border border-border bg-[var(--input-background)] text-[10px] sm:text-xs text-foreground hover:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-colors';
const TRIGGER_CLASS_BY_VARIANT = {
  compact: 'max-w-[120px] sm:max-w-[180px]',
  settings: 'w-full max-w-none justify-between',
} as const;
const PANEL_CLASS =
  'min-w-[220px] max-w-[340px] max-h-96 overflow-hidden rounded-lg border border-border bg-card shadow-lg z-[100] flex flex-col';
const OPTION_CLASS_BASE =
  'w-full px-3 py-2 text-left text-xs transition-colors truncate flex items-center gap-2';
const PANEL_DATA_ATTR = 'data-model-selector-panel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when the visual width is below the `sm` Tailwind breakpoint (640 px). */
function isMobileViewport(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT_PX;
}

type PanelRect =
  | { anchorBottom: false; top: number; left: number; width?: number; maxHeight: number }
  | { anchorBottom: true; bottom: number; left: number; maxHeight: number };

function clampPanelHeight(value: number): number {
  return Math.max(PANEL_MIN_HEIGHT_PX, Math.min(PANEL_MAX_HEIGHT_PX, value));
}

function computePanelRect(el: HTMLElement, placement: 'auto' | 'bottom'): PanelRect {
  const r = el.getBoundingClientRect();
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const panelWidth = Math.min(
    PANEL_MAX_WIDTH_PX,
    Math.max(PANEL_MIN_WIDTH_PX, r.width),
    viewportWidth - PANEL_GUTTER_PX * 2,
  );

  if (placement === 'bottom') {
    return {
      anchorBottom: false,
      top: Math.min(r.bottom + 6, viewportHeight - PANEL_GUTTER_PX - PANEL_MIN_HEIGHT_PX),
      left: Math.min(
        Math.max(PANEL_GUTTER_PX, r.left),
        Math.max(PANEL_GUTTER_PX, viewportWidth - panelWidth - PANEL_GUTTER_PX),
      ),
      width: panelWidth,
      maxHeight: clampPanelHeight(viewportHeight - r.bottom - PANEL_GUTTER_PX - 6),
    };
  }

  if (isMobileViewport()) {
    return {
      anchorBottom: true,
      bottom: viewportHeight - r.top + 4,
      left: PANEL_GUTTER_PX,
      maxHeight: clampPanelHeight(r.top - PANEL_GUTTER_PX - 4),
    };
  }

  return {
    anchorBottom: false,
    top: r.bottom + 6,
    left: r.left,
    maxHeight: clampPanelHeight(viewportHeight - r.bottom - PANEL_GUTTER_PX - 6),
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelSelectorProps {
  currentModel: string;
  options: string[];
  onSelect: (model: string) => void;
  onInputChange: (value: string) => void;
  visible: boolean;
  modelLocked?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  variant?: keyof typeof TRIGGER_CLASS_BY_VARIANT;
  dropdownPlacement?: 'auto' | 'bottom';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ModelSelector({
  currentModel,
  options,
  onSelect,
  onInputChange,
  visible,
  modelLocked = false,
  onRefresh,
  refreshing = false,
  variant = 'compact',
  dropdownPlacement = 'auto',
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [panelRect, setPanelRect] = useState<PanelRect | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const trimmed = currentModel.trim();
  const displayLabel = trimmed || DEFAULT_LABEL;
  const allOptions = trimmed && !options.includes(trimmed) ? [trimmed, ...options] : options;
  const triggerClass = `${TRIGGER_CLASS_BASE} ${TRIGGER_CLASS_BY_VARIANT[variant]}`;

  const query = searchQuery.trim().toLowerCase();
  const filteredOptions = query
    ? allOptions.filter((opt) => opt.toLowerCase().includes(query))
    : allOptions;

  // ── Panel positioning ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      setPanelRect(null);
      setSearchQuery('');
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    const update = () => setPanelRect(computePanelRect(el, dropdownPlacement));
    update();

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);

    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [open, dropdownPlacement]);

  // ── Close on outside tap/click ─────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handleClose = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest(`[${PANEL_DATA_ATTR}]`)) return;
      setOpen(false);
      setCustomMode(false);
    };
    document.addEventListener('mousedown', handleClose);
    document.addEventListener('touchstart', handleClose, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClose);
      document.removeEventListener('touchstart', handleClose);
    };
  }, [open]);

  // ── Focus management ───────────────────────────────────────────────────────

  useEffect(() => {
    if (customMode) customInputRef.current?.focus();
  }, [customMode]);

  useEffect(() => {
    if (!open || customMode) return;
    const id = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open, customMode]);

  // ── Event handlers ─────────────────────────────────────────────────────────

  const handleSelect = (value: string) => {
    onSelect(value === DEFAULT_LABEL ? '' : value);
    setOpen(false);
    setCustomMode(false);
  };

  const handleCustomSubmit = () => {
    const v = customValue.trim();
    if (v) { onInputChange(v); onSelect(v); }
    setCustomValue('');
    setCustomMode(false);
    setOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!visible) return null;

  if (modelLocked) {
    return (
      <div className={`${triggerClass} cursor-default opacity-90 border-border-subtle`} aria-label="Model in use">
        <span className="truncate">{displayLabel}</span>
      </div>
    );
  }

  const panelStyle: React.CSSProperties = panelRect
    ? panelRect.anchorBottom
      ? { position: 'fixed', bottom: panelRect.bottom, left: panelRect.left, right: panelRect.left, maxWidth: 'calc(100vw - 16px)' }
      : { position: 'fixed', top: panelRect.top, left: panelRect.left, width: panelRect.width }
    : {};

  return (
    <div ref={containerRef} className={variant === 'settings' ? 'relative w-full' : 'relative'}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select model"
      >
        <span className="truncate flex-1 text-left">{displayLabel}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && panelRect && createPortal(
        <div
          data-model-selector-panel
          className={PANEL_CLASS}
          role="listbox"
          aria-label="Model options"
          style={{ ...panelStyle, maxHeight: panelRect.maxHeight }}
        >
          {customMode ? (
            <div className="p-2 border-b border-border/50">
              <input
                ref={customInputRef}
                type="text"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomSubmit();
                  if (e.key === 'Escape') { setCustomMode(false); setCustomValue(''); setOpen(false); }
                }}
                onBlur={handleCustomSubmit}
                placeholder="Model name"
                className="w-full h-8 px-2.5 rounded-md text-xs border border-border bg-[var(--input-background)] text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                aria-label="Custom model name"
              />
            </div>
          ) : (
            <>
              {/* Search + Refresh toolbar */}
              <div className="flex items-center gap-1.5 p-2 border-b border-border/50 shrink-0">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setSearchQuery(''); setOpen(false); }
                  }}
                  placeholder="Search models…"
                  className="flex-1 h-7 px-2 rounded-md text-xs border border-border bg-[var(--input-background)] text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  aria-label="Search models"
                />
                {onRefresh && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (!refreshing) onRefresh(); }}
                    disabled={refreshing}
                    className="size-7 shrink-0 flex items-center justify-center rounded-md border border-border hover:bg-violet-500/10 hover:border-violet-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Refresh models from provider"
                    aria-label="Refresh models"
                  >
                    {refreshing
                      ? <Loader2 className="size-3.5 animate-spin text-violet-400" aria-hidden />
                      : <RefreshCw className="size-3.5 text-muted-foreground" aria-hidden />
                    }
                  </button>
                )}
              </div>

              {/* Options list */}
              <div className="overflow-auto flex-1 min-h-0">
                <button
                  type="button"
                  role="option"
                  aria-selected={!trimmed}
                  onClick={() => handleSelect(DEFAULT_LABEL)}
                  className={`${OPTION_CLASS_BASE} ${!trimmed ? MODEL_OPTION_SELECTED : 'text-foreground hover:bg-violet-500/10'}`}
                >
                  {DEFAULT_LABEL}
                </button>
                {filteredOptions.length === 0 && query && (
                  <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                    No models match "{searchQuery.trim()}"
                  </p>
                )}
                {filteredOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="option"
                    aria-selected={trimmed === opt}
                    onClick={() => handleSelect(opt)}
                    className={`${OPTION_CLASS_BASE} ${trimmed === opt ? MODEL_OPTION_SELECTED : 'text-foreground hover:bg-violet-500/10 hover:text-violet-400'}`}
                  >
                    {opt}
                  </button>
                ))}
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => setCustomMode(true)}
                  className={`${OPTION_CLASS_BASE} text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 border-t border-border/50 mt-1 pt-2`}
                >
                  Custom model...
                </button>
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
