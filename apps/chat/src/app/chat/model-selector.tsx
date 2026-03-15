import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { MODEL_OPTION_SELECTED } from '../ui-classes';

const DEFAULT_LABEL = 'Model (default)';
const TRIGGER_CLASS =
  'hidden md:flex items-center gap-1.5 min-w-0 max-w-[180px] h-8 px-3 rounded-lg border border-border bg-[var(--input-background)] text-[10px] sm:text-xs text-foreground hover:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-colors';
const PANEL_CLASS =
  'min-w-[160px] max-h-60 overflow-auto rounded-lg border border-border bg-card shadow-lg py-1 z-[100]';
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
}

export function ModelSelector({
  currentModel,
  options,
  onSelect,
  onInputChange,
  visible,
  modelLocked = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const displayLabel = currentModel.trim() || DEFAULT_LABEL;
  const hasCustom = currentModel.trim() && !options.includes(currentModel.trim());
  const displayOptions = hasCustom
    ? [currentModel.trim(), ...options]
    : options;

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
                <button
                  type="button"
                  role="option"
                  aria-selected={!currentModel.trim()}
                  onClick={() => handleSelect(DEFAULT_LABEL)}
                  className={`${OPTION_CLASS_BASE} ${!currentModel.trim() ? MODEL_OPTION_SELECTED : 'text-foreground hover:bg-violet-500/10'}`}
                >
                  {DEFAULT_LABEL}
                </button>
                {displayOptions.map((opt) => (
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
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
