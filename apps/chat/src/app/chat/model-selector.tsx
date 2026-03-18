import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RefreshCw, Loader2 } from 'lucide-react';
import { MODEL_OPTION_SELECTED } from '../ui-classes';

const DEFAULT_LABEL = 'Model (default)';
const TRIGGER_CLASS =
  'hidden md:flex items-center gap-1.5 min-w-0 max-w-[180px] h-8 px-3 rounded-lg border border-border bg-[var(--input-background)] text-[10px] sm:text-xs text-foreground hover:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-colors';
const PANEL_CLASS =
  'min-w-[220px] max-w-[340px] max-h-96 overflow-hidden rounded-lg border border-border bg-card shadow-lg z-[100] flex flex-col';
const OPTION_CLASS_BASE =
  'w-full px-3 py-2 text-left text-xs transition-colors truncate flex items-center gap-2';
const PANEL_DATA_ATTR = 'data-model-selector-panel';

interface ModelSelectorProps {
  currentModel: string;
  options: string[];
  onSelect: (model: string) => void;
  onInputChange: (value: string) => void;
  visible: boolean;
  modelLocked?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function ModelSelector({
  currentModel,
  options,
  onSelect,
  onInputChange,
  visible,
  modelLocked = false,
  onRefresh,
  refreshing = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [panelRect, setPanelRect] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const displayLabel = currentModel.trim() || DEFAULT_LABEL;
  const hasCustom = currentModel.trim() && !options.includes(currentModel.trim());
  const allOptions = hasCustom
    ? [currentModel.trim(), ...options]
    : options;

  // Filter options by search query
  const query = searchQuery.trim().toLowerCase();
  const filteredOptions = query
    ? allOptions.filter((opt) => opt.toLowerCase().includes(query))
    : allOptions;

  useEffect(() => {
    if (!open) {
      setPanelRect(null);
      setSearchQuery('');
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
      setCustomMode(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (customMode) customInputRef.current?.focus();
  }, [customMode]);

  // Focus search input when panel opens (and not in custom mode)
  useEffect(() => {
    if (open && !customMode && searchInputRef.current) {
      // Small delay to let the portal render
      const id = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
    return;
  }, [open, customMode]);

  const handleSelect = (value: string) => {
    const model = value === DEFAULT_LABEL ? '' : value;
    onSelect(model);
    setOpen(false);
    setCustomMode(false);
  };

  const handleCustomSubmit = () => {
    const v = customValue.trim();
    if (v) {
      onInputChange(v);
      onSelect(v);
    }
    setCustomValue('');
    setCustomMode(false);
    setOpen(false);
  };

  if (!visible) return null;

  if (modelLocked) {
    return (
      <div
        className={`${TRIGGER_CLASS} cursor-default opacity-90 border-border-subtle`}
        aria-label="Model in use"
      >
        <span className="truncate">{displayLabel}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={TRIGGER_CLASS}
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
      {open &&
        panelRect &&
        createPortal(
          <div
            data-model-selector-panel
            className={PANEL_CLASS}
            role="listbox"
            aria-label="Model options"
            style={{
              position: 'fixed',
              top: panelRect.top,
              left: panelRect.left,
            }}
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
                    if (e.key === 'Escape') {
                      setCustomMode(false);
                      setCustomValue('');
                      setOpen(false);
                    }
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
                      if (e.key === 'Escape') {
                        setSearchQuery('');
                        setOpen(false);
                      }
                    }}
                    placeholder="Search models…"
                    className="flex-1 h-7 px-2 rounded-md text-xs border border-border bg-[var(--input-background)] text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    aria-label="Search models"
                  />
                  {onRefresh && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!refreshing) onRefresh();
                      }}
                      disabled={refreshing}
                      className="size-7 shrink-0 flex items-center justify-center rounded-md border border-border hover:bg-violet-500/10 hover:border-violet-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Refresh models from provider"
                      aria-label="Refresh models"
                    >
                      {refreshing ? (
                        <Loader2 className="size-3.5 animate-spin text-violet-400" aria-hidden />
                      ) : (
                        <RefreshCw className="size-3.5 text-muted-foreground" aria-hidden />
                      )}
                    </button>
                  )}
                </div>

                {/* Options list */}
                <div className="overflow-auto flex-1">
                  <button
                    type="button"
                    role="option"
                    aria-selected={!currentModel.trim()}
                    onClick={() => handleSelect(DEFAULT_LABEL)}
                    className={`${OPTION_CLASS_BASE} ${!currentModel.trim() ? MODEL_OPTION_SELECTED : 'text-foreground hover:bg-violet-500/10'}`}
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
                      aria-selected={currentModel.trim() === opt}
                      onClick={() => handleSelect(opt)}
                      className={`${OPTION_CLASS_BASE} ${currentModel.trim() === opt ? MODEL_OPTION_SELECTED : 'text-foreground hover:bg-violet-500/10 hover:text-violet-400'}`}
                    >
                      {opt}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="option"
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
