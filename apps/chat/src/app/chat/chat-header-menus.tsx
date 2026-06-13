/**
 * Floating-panel menu components used in the ChatHeader:
 * - SimplicateSwitch
 * - EffortRange
 * - ProviderModelMenu
 * - MoreActionsMenu
 * - CompactConversationPicker
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Command,
  Ellipsis,
  GitCompareArrows,
  MessageSquare,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  TerminalSquare,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EFFORT_OPTIONS, resolveEffort } from '@shared/effort.constants';
import { CHAT_STATES } from './chat-state';
import { ModelSelector } from './model-selector';
import { LocaleSelector } from '../locale-selector';
import { useT, type TranslationKey } from '../i18n';
import { INPUT_SEARCH, SEARCH_ICON_POSITION, CLEAR_BUTTON_POSITION } from '../ui-classes';
import {
  computeFloatingPanelRect,
  MORE_MENU_PANEL_ATTR,
  PROVIDER_MODEL_PANEL_ATTR,
  MORE_MENU_ITEM_CLASS,
  MORE_MENU_ITEM_ACTIVE_CLASS,
  type FloatingPanelRect,
} from './chat-header-utils';
import { StarkGlassesIcon, PlaygroundSelectorSlot } from './chat-header-controls';
import type { ChatHeaderProps } from './chat-header';

// ─── SimplicateSwitch ─────────────────────────────────────────────────────────

export function SimplicateSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={t('header.simplicate')}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
        checked ? 'border-primary/70 bg-primary' : 'border-muted-foreground/50 bg-background/80'
      } ${checked ? 'justify-end' : 'justify-start'}`}
    >
      <span
        className={`pointer-events-none block size-4 rounded-full border shadow-sm transition-colors ${
          checked ? 'border-white/70 bg-white' : 'border-muted-foreground/50 bg-muted-foreground'
        }`}
      />
    </button>
  );
}

// ─── EffortRange ──────────────────────────────────────────────────────────────

export function EffortRange({
  currentEffort,
  onEffortSelect,
}: {
  currentEffort: string;
  onEffortSelect: (effort: string) => void;
}) {
  const t = useT();
  const selectedEffort = resolveEffort(currentEffort);
  const selectedIndex = Math.max(0, EFFORT_OPTIONS.indexOf(selectedEffort));
  const selectedLabel = t(`effort.${selectedEffort}` as TranslationKey);

  const handleChange = (value: string) => {
    const index = Math.max(0, Math.min(EFFORT_OPTIONS.length - 1, Number(value)));
    onEffortSelect(EFFORT_OPTIONS[index]);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-background/35 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('header.effort')}</span>
        <span className="text-xs font-medium text-foreground">{selectedLabel}</span>
      </div>
      <input
        type="range"
        min={0}
        max={EFFORT_OPTIONS.length - 1}
        step={1}
        value={selectedIndex}
        onChange={(e) => handleChange(e.target.value)}
        className="h-2 w-full cursor-pointer accent-primary"
        aria-label={t('header.effort')}
        aria-valuetext={selectedLabel}
      />
      <div className="grid grid-cols-5 gap-1 text-[10px] text-muted-foreground">
        {EFFORT_OPTIONS.map((effort) => (
          <span
            key={effort}
            className={`truncate text-center ${effort === selectedEffort ? 'font-medium text-primary' : ''}`}
          >
            {t(`effort.${effort}` as TranslationKey)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── ProviderModelMenu ────────────────────────────────────────────────────────

export interface ProviderModelMenuProps {
  children: React.ReactNode;
  triggerClassName: string;
  panelLabel: string;
  showModelSelector?: boolean;
  currentModel?: string;
  modelOptions?: string[];
  onModelSelect?: (model: string) => void;
  onModelInputChange?: (value: string) => void;
  modelLocked?: boolean;
  onRefreshModels?: () => void;
  refreshingModels?: boolean;
  currentEffort?: string;
  onEffortSelect?: (effort: string) => void;
}

export function ProviderModelMenu({
  children,
  triggerClassName,
  panelLabel,
  showModelSelector = false,
  currentModel = '',
  modelOptions = [],
  onModelSelect,
  onModelInputChange,
  modelLocked = false,
  onRefreshModels,
  refreshingModels = false,
  currentEffort = 'max',
  onEffortSelect,
}: ProviderModelMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<FloatingPanelRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasModelControls = showModelSelector && Boolean(onModelSelect && onModelInputChange);
  const hasEffortControls = Boolean(onEffortSelect);
  const hasControls = hasModelControls || hasEffortControls;

  const updateRect = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPanelRect(computeFloatingPanelRect(trigger, 360));
  }, []);

  useEffect(() => {
    if (!open) {
      setPanelRect(null);
      return;
    }
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    window.visualViewport?.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
      window.visualViewport?.removeEventListener('resize', updateRect);
    };
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (triggerRef.current?.contains(target)) return;
      if (target.closest(`[${PROVIDER_MODEL_PANEL_ATTR}]`)) return;
      if (target.closest('[data-model-selector-panel]')) return;
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!hasControls) {
    return <div className={triggerClassName}>{children}</div>;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`${triggerClassName} rounded-md transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/30`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={panelLabel}
        title={panelLabel}
      >
        {children}
      </button>
      {open &&
        panelRect &&
        createPortal(
          <div
            data-provider-model-menu=""
            role="dialog"
            aria-label={panelLabel}
            className="z-[100] flex flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-card/95 p-3 shadow-xl shadow-black/30 backdrop-blur-xl"
            style={{
              position: 'fixed',
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
              maxHeight: panelRect.maxHeight,
            }}
          >
            {hasModelControls && onModelSelect && onModelInputChange && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('header.model')}</span>
                <ModelSelector
                  currentModel={currentModel}
                  options={modelOptions}
                  onSelect={onModelSelect}
                  onInputChange={onModelInputChange}
                  visible={true}
                  modelLocked={modelLocked}
                  onRefresh={onRefreshModels}
                  refreshing={refreshingModels}
                  variant="settings"
                  dropdownPlacement="bottom"
                />
              </div>
            )}
            {onEffortSelect && (
              <EffortRange currentEffort={currentEffort} onEffortSelect={onEffortSelect} />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

// ─── MoreActionsMenu ──────────────────────────────────────────────────────────

export interface MoreActionsMenuProps {
  playgroundProps: ChatHeaderProps;
  searchQuery: string;
  filteredMessagesCount: number;
  onSearchChange: (value: string) => void;
  statsLabel: string;
  statsAriaLabel: string;
  onStartAuth: () => void;
  state: string;
  onOpenFileBrowser?: () => void;
  onToggleTerminal?: () => void;
  terminalOpen: boolean;
  onToggleDiff?: () => void;
  diffOpen: boolean;
  onToggleCli?: () => void;
  cliOpen: boolean;
  onToggleTonyStarkMode?: () => void;
  simplicateMode: boolean;
  onSimplicateModeChange?: (enabled: boolean) => void;
  onResetConversation?: () => void;
}

export function MoreActionsMenu({
  playgroundProps,
  searchQuery,
  filteredMessagesCount,
  onSearchChange,
  statsLabel,
  statsAriaLabel,
  onStartAuth,
  state,
  onToggleTerminal,
  terminalOpen,
  onToggleDiff,
  diffOpen,
  onToggleCli,
  cliOpen,
  onToggleTonyStarkMode,
  simplicateMode,
  onSimplicateModeChange,
  onResetConversation,
}: MoreActionsMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<FloatingPanelRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const updateRect = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = computeFloatingPanelRect(trigger, 360);
    const triggerRect = trigger.getBoundingClientRect();
    setPanelRect({
      ...rect,
      left: Math.max(8, triggerRect.right - rect.width),
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setPanelRect(null);
      return;
    }
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    window.visualViewport?.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
      window.visualViewport?.removeEventListener('resize', updateRect);
    };
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (triggerRef.current?.contains(target)) return;
      if (target.closest(`[${MORE_MENU_PANEL_ATTR}]`)) return;
      if (target.closest('[data-playground-selector-panel]')) return;
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const runAndClose = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
  }, []);

  const canShowStartAuth = state === CHAT_STATES.UNAUTHENTICATED;

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 sm:size-9"
        title={t('header.moreActions')}
        aria-label={t('header.moreActions')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Ellipsis className="size-5" aria-hidden />
      </button>
      {open &&
        panelRect &&
        createPortal(
          <div
            data-chat-header-more-menu=""
            role="menu"
            aria-label={t('header.chatActions')}
            className="z-[100] flex flex-col overflow-hidden rounded-lg border border-border bg-card/95 p-1.5 shadow-xl shadow-black/30 backdrop-blur-xl"
            style={{
              position: 'fixed',
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
              maxHeight: panelRect.maxHeight,
            }}
          >
            <div className="min-h-0 overflow-y-auto">
              {onToggleTonyStarkMode && (
                <Link
                  to="/stark"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={MORE_MENU_ITEM_CLASS}
                  title={t('header.tonyStark')}
                >
                  <StarkGlassesIcon className="size-4 shrink-0 text-cyan-400" />
                  <span className="min-w-0 flex-1 truncate">{t('header.tonyStark')}</span>
                </Link>
              )}

              <PlaygroundSelectorSlot props={playgroundProps} variant="menu" />

              {onToggleTerminal && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runAndClose(onToggleTerminal)}
                  className={`${MORE_MENU_ITEM_CLASS} ${terminalOpen ? MORE_MENU_ITEM_ACTIVE_CLASS : ''}`}
                >
                  <TerminalSquare className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{t('header.terminal')}</span>
                </button>
              )}

              {onToggleCli && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runAndClose(onToggleCli)}
                  className={`${MORE_MENU_ITEM_CLASS} ${cliOpen ? MORE_MENU_ITEM_ACTIVE_CLASS : ''}`}
                >
                  <Command className="size-4 shrink-0 text-blue-300" />
                  <span className="min-w-0 flex-1 truncate">{t('header.commands')}</span>
                </button>
              )}

              {onToggleDiff && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runAndClose(onToggleDiff)}
                  className={`${MORE_MENU_ITEM_CLASS} ${diffOpen ? MORE_MENU_ITEM_ACTIVE_CLASS : ''}`}
                >
                  <GitCompareArrows className="size-4 shrink-0 text-emerald-300" />
                  <span className="min-w-0 flex-1 truncate">{t('header.gitDiff')}</span>
                </button>
              )}

              {canShowStartAuth && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runAndClose(onStartAuth)}
                  className={MORE_MENU_ITEM_CLASS}
                >
                  <Sparkles className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{t('header.startAuth')}</span>
                </button>
              )}

              {onResetConversation && (
                <button
                  type="button"
                  id="chat-header-reset-conversation-btn"
                  role="menuitem"
                  onClick={() => runAndClose(onResetConversation)}
                  className={`${MORE_MENU_ITEM_CLASS} text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300`}
                >
                  <RefreshCcw className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t('settings.resetTitle')}</span>
                </button>
              )}

              {onSimplicateModeChange && (
                <div className="mt-1 border-t border-border/40 pt-1">
                  <div className="flex h-9 items-center justify-between gap-3 rounded-md px-2.5 text-sm text-foreground">
                    <span className="min-w-0 flex-1 truncate">{t('header.simplicate')}</span>
                    <SimplicateSwitch
                      checked={simplicateMode}
                      onChange={onSimplicateModeChange}
                    />
                  </div>
                </div>
              )}

              <div className="mt-1 border-t border-border/40 px-2.5 py-2">
                <div
                  className="text-xs font-medium tabular-nums text-muted-foreground"
                  aria-label={statsAriaLabel}
                  title={statsAriaLabel}
                >
                  {statsLabel}
                </div>
              </div>

              <LocaleSelector variant="menu" />

              <div className="border-t border-border/40 px-1 pt-2">
                <div className="relative h-8">
                  <Search className={SEARCH_ICON_POSITION} aria-hidden />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={t('header.searchPlaceholder')}
                    className={INPUT_SEARCH}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => onSearchChange('')}
                      className={CLEAR_BUTTON_POSITION}
                      aria-label={t('header.clearSearch')}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <p className="px-1 pt-1.5 text-[10px] text-muted-foreground">
                    {filteredMessagesCount === 1
                      ? t('header.foundOne')
                      : t('header.foundMany', { count: filteredMessagesCount })}
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ─── CompactConversationPicker ────────────────────────────────────────────────

/** Small inline conversation switcher shown in the simplicate (compact) header. */
export function CompactConversationPicker({
  conversations,
  activeId,
  onSelect,
  onCreate,
}: {
  conversations: import('./use-conversations').ConversationMeta[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate?: () => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const activeConv = conversations.find((c) => c.id === activeId);
  const label = activeConv?.title ?? t('header.conversations');

  const openPicker = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: Math.max(200, r.width) });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const handleSelect = useCallback((id: string) => {
    onSelect(id);
    setOpen(false);
  }, [onSelect]);

  const handleCreate = useCallback(async () => {
    setOpen(false);
    await onCreate?.();
  }, [onCreate]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open ? () => setOpen(false) : openPicker}
        aria-label={t('header.switchConversation')}
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 ${open ? 'bg-primary/15 text-primary' : ''}`}
        title={label}
      >
        <MessageSquare className="size-4 shrink-0 text-primary" aria-hidden />
      </button>
      {open && rect && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('header.conversations')}
          className="fixed z-[200] min-w-[180px] overflow-hidden rounded-lg border border-border bg-card/95 shadow-xl shadow-black/30 backdrop-blur-xl py-1"
          style={{ top: rect.top, left: rect.left, width: rect.width }}
        >
          <div className="max-h-60 overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(c.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  c.id === activeId
                    ? 'bg-primary/15 text-primary'
                    : 'text-foreground hover:bg-muted/50'
                }`}
              >
                <MessageSquare className="size-3 shrink-0 text-muted-foreground/60" />
                <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
              </button>
            ))}
          </div>
          {onCreate && (
            <div className="border-t border-border/40 px-1 pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={handleCreate}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
              >
                <Plus className="size-3.5 shrink-0" />
                <span>{t('conversation.newChat')}</span>
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
