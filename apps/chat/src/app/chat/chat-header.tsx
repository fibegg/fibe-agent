import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brain, ChevronDown, Command, Ellipsis, FolderOpen, GitCompareArrows, Loader2, Menu, MessageSquare, Plus, RefreshCcw, Search, Settings, Sparkles, TerminalSquare, X } from 'lucide-react';

import { Link } from 'react-router-dom';
import { EFFORT_OPTIONS, resolveEffort } from '@shared/effort.constants';
import { PlaygroundSelector } from './playground-selector';
import { ModelSelector } from './model-selector';
import type { BrowseEntry } from './use-playground-selector';
import { CHAT_STATES, truncateError } from './chat-state';
import { getChatStateLabel, type ChatState } from './chat-state';
import { TypewriterText } from './typewriter-text';
import { formatCompactInteger, formatSessionDurationMs } from '../agent-thinking-utils';
import { HEADER_FIRST_ROW, INPUT_SEARCH, SEARCH_ICON_POSITION, CLEAR_BUTTON_POSITION } from '../ui-classes';
import { PANEL_HEADER_MIN_HEIGHT_PX } from '../layout-constants';
import { LocaleSelector } from '../locale-selector';
import { useT, type TranslationKey } from '../i18n';

export interface ChatHeaderProps {
  isMobile: boolean;
  agentName?: string;
  agentProvider?: string | null;
  agentProviderLabel?: string | null;
  currentModel?: string;
  state: string;
  agentMode?: string;
  errorMessage: string | null;
  sessionTimeMs: number;
  mobileSessionStats: { totalActions: number; completed: number; processing: number };
  sessionTokenUsage?: { inputTokens: number; outputTokens: number } | null;
  mobileBrainClasses: { brain: string; accent: string };
  statusClass: string;
  searchQuery: string;
  filteredMessagesCount: number;
  onSearchChange: (value: string) => void;
  onReconnect: () => void;
  onStartAuth: () => void;
  onOpenMenu: () => void;
  onOpenActivity: () => void;
  onToggleTerminal?: () => void;
  terminalOpen?: boolean;
  onToggleDiff?: () => void;
  diffOpen?: boolean;
  onToggleCli?: () => void;
  cliOpen?: boolean;
  tonyStarkMode?: boolean;
  onToggleTonyStarkMode?: () => void;
  simplicateMode?: boolean;
  onSimplicateModeChange?: (enabled: boolean) => void;
  onOpenFileBrowser?: () => void;
  currentEffort?: string;
  onEffortSelect?: (effort: string) => void;
  showModelSelector?: boolean;
  modelOptions?: string[];
  onModelSelect?: (model: string) => void;
  onModelInputChange?: (value: string) => void;
  modelLocked?: boolean;
  onRefreshModels?: () => void;
  refreshingModels?: boolean;
  // Playground selector
  playgroundEntries?: BrowseEntry[];
  playgroundLoading?: boolean;
  playgroundError?: string | null;
  playgroundCurrentLink?: string | null;
  playgroundLinking?: boolean;
  playgroundCanGoBack?: boolean;
  playgroundBreadcrumbs?: string[];
  onPlaygroundOpen?: () => void;
  onPlaygroundBrowse?: (path: string) => void;
  onPlaygroundGoBack?: () => void;
  onPlaygroundGoToRoot?: () => void;
  onPlaygroundLink?: (path: string) => Promise<boolean>;
  onPlaygroundLinked?: () => void;
  onPlaygroundSmartMount?: () => void;
  /** When provided, shows a Reset button in the MoreActionsMenu. */
  onResetConversation?: () => void;
  /** Number of currently connected WS sessions (browser tabs). */
  sessionCount?: number;
  /** True if any connected session's agent is processing a request right now. */
  anyProcessing?: boolean;
  /** Toggle the conversations drawer in the main chat column. */
  onToggleConversations?: () => void;
  conversationsOpen?: boolean;
  /** Conversations for the compact-mode inline picker. */
  conversations?: import('./use-conversations').ConversationMeta[];
  activeConversationId?: string;
  onConversationSelect?: (id: string) => void;
  onConversationCreate?: () => Promise<void>;
}

const StarkGlassesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* Bridge */}
    <path d="M10 11h4" fill="none" strokeWidth="2" />
    {/* Left lens (angular aviator style) */}
    <path d="M10 11l-1.5 4.5H3.5L2 11h8z" />
    {/* Right lens (angular aviator style) */}
    <path d="M14 11l1.5 4.5h5l1.5-4.5h-8z" />
    {/* Left arm */}
    <path d="M2 11V9c0-1 .5-2 1.5-2h1" fill="none" strokeWidth="1.5" />
    {/* Right arm */}
    <path d="M22 11V9c0-1-.5-2-1.5-2h-1" fill="none" strokeWidth="1.5" />
    {/* Gradient or glass reflection lines */}
    <path d="M5 11l-1.5 2" fill="none" stroke="black" strokeWidth="1" strokeOpacity="0.3" />
    <path d="M16 11l-1.5 2" fill="none" stroke="black" strokeWidth="1" strokeOpacity="0.3" />
  </svg>
);

/** Shared prop-forwarding helper — avoids repeating the 13-prop spread twice. */
function PlaygroundSelectorSlot({
  props,
  className,
  variant = 'icon',
}: {
  props: ChatHeaderProps;
  className?: string;
  variant?: 'icon' | 'menu';
}) {
  if (!props.onPlaygroundOpen || !props.onPlaygroundLink) {
    return null;
  }

  return (
    <div className={className}>
      <PlaygroundSelector
        entries={props.playgroundEntries ?? []}
        loading={props.playgroundLoading ?? false}
        error={props.playgroundError ?? null}
        currentLink={props.playgroundCurrentLink ?? null}
        linking={props.playgroundLinking ?? false}
        onOpen={props.onPlaygroundOpen}
        onLink={props.onPlaygroundLink}
        onLinked={props.onPlaygroundLinked}
        visible={true}
        variant={variant}
      />
    </div>
  );
}

/** Commands toggle button, shared between the desktop top-row and the mobile search-row. */
function CliButton({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className: string;
}) {
  const t = useT();
  const label = open ? t('header.commands') : t('header.commands');
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className} rounded-md flex items-center justify-center transition-colors shrink-0 ${
        open
          ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
          : 'text-muted-foreground hover:bg-blue-500/10 hover:text-blue-300'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={open}
    >
      <Command className="size-4" />
    </button>
  );
}

/** Diff toggle button, shared between the desktop top-row and the mobile search-row. */
function DiffButton({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className: string;
}) {
  const t = useT();
  const label = t('header.gitDiff');
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className} rounded-md flex items-center justify-center transition-colors shrink-0 ${
        open
          ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
          : 'text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-300'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={open}
    >
      <GitCompareArrows className="size-4" />
    </button>
  );
}

/** Terminal toggle button, shared between the desktop top-row and the mobile search-row. */
function TerminalButton({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className: string;
}) {
  const t = useT();
  const label = open ? t('header.closeTerminal') : t('header.openTerminal');
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className} rounded-md flex items-center justify-center transition-colors shrink-0 ${
        open
          ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
          : 'text-muted-foreground hover:bg-violet-500/10 hover:text-violet-300'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={open}
    >
      <TerminalSquare className="size-4" />
    </button>
  );
}

const MORE_MENU_PANEL_ATTR = 'data-chat-header-more-menu';
const PROVIDER_MODEL_PANEL_ATTR = 'data-provider-model-menu';
const MORE_MENU_ITEM_CLASS =
  'flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30';
const MORE_MENU_ITEM_ACTIVE_CLASS = 'bg-violet-500/15 text-violet-300';

type FloatingPanelRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function computeFloatingPanelRect(anchor: HTMLElement, widthPx: number): FloatingPanelRect {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const gutter = 8;
  const width = Math.min(widthPx, viewportWidth - gutter * 2);
  const left = Math.min(
    Math.max(gutter, rect.left),
    Math.max(gutter, viewportWidth - width - gutter),
  );
  const top = Math.min(rect.bottom + 8, Math.max(gutter, viewportHeight - gutter - 180));
  return {
    top,
    left,
    width,
    maxHeight: Math.max(180, viewportHeight - top - gutter),
  };
}

function SimplicateSwitch({
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
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/30 ${
        checked ? 'border-violet-400/70 bg-violet-500' : 'border-muted-foreground/50 bg-background/80'
      }`}
    >
      <span
        className={`pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full border shadow-sm transition-transform ${
          checked ? 'translate-x-4 border-white/70 bg-white' : 'translate-x-0 border-muted-foreground/50 bg-muted-foreground'
        }`}
      />
    </button>
  );
}

function EffortRange({
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
        className="h-2 w-full cursor-pointer accent-violet-500"
        aria-label={t('header.effort')}
        aria-valuetext={selectedLabel}
      />
      <div className="grid grid-cols-5 gap-1 text-[10px] text-muted-foreground">
        {EFFORT_OPTIONS.map((effort) => (
          <span
            key={effort}
            className={`truncate text-center ${effort === selectedEffort ? 'font-medium text-violet-300' : ''}`}
          >
            {t(`effort.${effort}` as TranslationKey)}
          </span>
        ))}
      </div>
    </div>
  );
}

interface ProviderModelMenuProps {
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

function ProviderModelMenu({
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
        className={`${triggerClassName} rounded-md transition-colors hover:bg-violet-500/10 focus:outline-none focus:ring-2 focus:ring-violet-500/30`}
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

interface MoreActionsMenuProps {
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

function MoreActionsMenu({
  playgroundProps,
  searchQuery,
  filteredMessagesCount,
  onSearchChange,
  statsLabel,
  statsAriaLabel,
  onStartAuth,
  state,
  onOpenFileBrowser,
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
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 sm:size-9"
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
                  <TerminalSquare className="size-4 shrink-0 text-violet-300" />
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

              {onOpenFileBrowser && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runAndClose(onOpenFileBrowser)}
                  className={MORE_MENU_ITEM_CLASS}
                >
                  <FolderOpen className="size-4 shrink-0 text-amber-300" />
                  <span className="min-w-0 flex-1 truncate">{t('header.files')}</span>
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
                  <Sparkles className="size-4 shrink-0 text-violet-300" />
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

function isKnownChatState(state: string): state is ChatState {
  return Object.values(CHAT_STATES).includes(state as ChatState);
}

/** Small inline conversation switcher shown in the simplicate (compact) header. */
function CompactConversationPicker({
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const activeConv = conversations.find((c) => c.id === activeId);
  const label = activeConv?.title ?? 'Conversations';

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
      if (triggerRef.current?.contains(e.target as Node)) return;
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
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-violet-500/10 hover:text-violet-300 transition-colors max-w-[120px]"
        title={label}
      >
        <MessageSquare className="size-3 shrink-0 text-violet-400" />
        <span className="truncate">{label}</span>
        <ChevronDown className={`size-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <span className="shrink-0 text-muted-foreground/40">·</span>
      {open && rect && createPortal(
        <div
          className="fixed z-[200] min-w-[180px] overflow-hidden rounded-lg border border-border bg-card/95 shadow-xl shadow-black/30 backdrop-blur-xl py-1"
          style={{ top: rect.top, left: rect.left, width: rect.width }}
        >
          <div className="max-h-60 overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  c.id === activeId
                    ? 'bg-violet-500/15 text-violet-300'
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
                onClick={handleCreate}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-violet-400 hover:bg-violet-500/10 transition-colors"
              >
                <Plus className="size-3.5 shrink-0" />
                <span>New chat</span>
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

export function ChatHeader({
  isMobile,
  agentName,
  agentProvider,
  agentProviderLabel,
  currentModel,
  state,
  agentMode,
  errorMessage,
  sessionTimeMs,
  mobileSessionStats,
  sessionTokenUsage = null,
  mobileBrainClasses,
  statusClass,
  searchQuery,
  filteredMessagesCount,
  onSearchChange,
  onReconnect,
  onStartAuth,
  onOpenMenu,
  onOpenActivity,
  onToggleTerminal,
  terminalOpen = false,
  onToggleDiff,
  diffOpen = false,
  onToggleCli,
  cliOpen = false,
  tonyStarkMode = false,
  onToggleTonyStarkMode,
  simplicateMode = false,
  onSimplicateModeChange,
  onOpenFileBrowser,
  currentEffort = 'max',
  onEffortSelect,
  showModelSelector = false,
  modelOptions = [],
  onModelSelect,
  onModelInputChange,
  modelLocked = false,
  onRefreshModels,
  refreshingModels = false,
  onResetConversation,
  sessionCount = 1,
  anyProcessing = false,
  onToggleConversations,
  conversationsOpen = false,
  conversations,
  activeConversationId,
  onConversationSelect,
  onConversationCreate,
  ...rest
}: ChatHeaderProps) {
  const t = useT();
  const displayName = agentName || agentProviderLabel?.trim() || 'Claude';
  const modelLabel = currentModel?.trim() ?? '';
  // Collect all playground-related props so they can be forwarded via PlaygroundSelectorSlot.
  const playgroundProps: ChatHeaderProps = {
    isMobile,
    agentName,
    agentProvider,
    agentProviderLabel,
    currentModel,
    state,
    agentMode,
    errorMessage,
    sessionTimeMs,
    mobileSessionStats,
    sessionTokenUsage,
    mobileBrainClasses,
    statusClass,
    searchQuery,
    filteredMessagesCount,
    onSearchChange,
    onReconnect,
    onStartAuth,
    onOpenMenu,
    onOpenActivity,
    onToggleTerminal,
    terminalOpen,
    onToggleDiff,
    diffOpen,
    onToggleCli,
    cliOpen,
    tonyStarkMode,
    onToggleTonyStarkMode,
    simplicateMode,
    onSimplicateModeChange,
    onOpenFileBrowser,
    currentEffort,
    onEffortSelect,
    showModelSelector,
    modelOptions,
    onModelSelect,
    onModelInputChange,
    modelLocked,
    onRefreshModels,
    refreshingModels,
    ...rest,
  };
  const statusContent = state === CHAT_STATES.AWAITING_RESPONSE && agentMode
    ? <TypewriterText text={agentMode} speed={40} />
    : state === CHAT_STATES.AGENT_OFFLINE && errorMessage
    ? truncateError(errorMessage)
    : isKnownChatState(state) ? getChatStateLabel(state, t) : state;
  const statusTextClass = state === CHAT_STATES.AWAITING_RESPONSE ? 'text-warning' : statusClass;
  const statsLabel = useMemo(() => {
    const parts = [
      `${mobileSessionStats.totalActions}/${mobileSessionStats.completed}/${mobileSessionStats.processing}`,
    ];
    if (sessionTokenUsage) {
        parts.push(
          `${formatCompactInteger(sessionTokenUsage.inputTokens)} ${t('header.inputShort')} / ${formatCompactInteger(sessionTokenUsage.outputTokens)} ${t('header.outputShort')}`,
        );
    }
    if (sessionTimeMs > 0) {
      parts.push(formatSessionDurationMs(sessionTimeMs));
    }
    return parts.join(' · ');
  }, [mobileSessionStats.completed, mobileSessionStats.processing, mobileSessionStats.totalActions, sessionTimeMs, sessionTokenUsage, t]);
  const statsAriaLabel = `${mobileSessionStats.totalActions} ${t('header.totalActions')} / ${mobileSessionStats.completed} ${t('header.completed')} / ${mobileSessionStats.processing} ${t('header.processing')}${sessionTokenUsage ? ` / ${sessionTokenUsage.inputTokens} ${t('header.inputShort')} / ${sessionTokenUsage.outputTokens} ${t('header.outputShort')}` : ''}${sessionTimeMs > 0 ? ` / ${formatSessionDurationMs(sessionTimeMs)}` : ''}`;
  const compactMode = simplicateMode;
  const canShowReconnect = state === CHAT_STATES.AGENT_OFFLINE || state === CHAT_STATES.ERROR;
  const menuButtonLabel = compactMode ? t('header.openSettings') : t('header.openMenu');
  const simplicateHeaderRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isMobile || !compactMode) return;
    const el = simplicateHeaderRef.current;
    if (!el) return;
    const update = () => {
      const offsetTop = window.visualViewport?.offsetTop ?? 0;
      el.style.transform = offsetTop ? `translateY(${offsetTop}px)` : '';
    };
    update();
    const vv = window.visualViewport;
    vv?.addEventListener('scroll', update);
    vv?.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('scroll', update);
      vv?.removeEventListener('resize', update);
      if (el) el.style.transform = '';
    };
  }, [isMobile, compactMode]);

  if (compactMode) {
    return (
      <header
        ref={simplicateHeaderRef}
        className="border-b border-border/30 bg-card/60 px-3 pb-2 backdrop-blur-xl shrink-0 sm:px-4 relative z-30"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0.5rem))', willChange: 'transform' }}
      >
        <div className="flex h-10 items-center justify-between gap-2">
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-transparent text-violet-500 transition-colors hover:bg-violet-500/10 active:scale-[0.98] sm:size-9"
            aria-label={menuButtonLabel}
            title={menuButtonLabel}
          >
            <Settings className="size-4 sm:size-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5 text-sm">
              {/* Compact conversation picker — only in simplicate mode when conversations exist */}
              {conversations && conversations.length > 0 && onConversationSelect && (
                <CompactConversationPicker
                  conversations={conversations}
                  activeId={activeConversationId ?? ''}
                  onSelect={onConversationSelect}
                  onCreate={onConversationCreate}
                />
              )}
              <ProviderModelMenu
                triggerClassName="-ml-1 inline-flex min-w-0 max-w-[62vw] items-center gap-1.5 px-1 py-0.5 text-left sm:max-w-[360px]"
                panelLabel={t('header.changeModelEffort')}
                showModelSelector={showModelSelector}
                currentModel={currentModel}
                modelOptions={modelOptions}
                onModelSelect={onModelSelect}
                onModelInputChange={onModelInputChange}
                modelLocked={modelLocked}
                onRefreshModels={onRefreshModels}
                refreshingModels={refreshingModels}
                currentEffort={currentEffort}
                onEffortSelect={onEffortSelect}
              >
                <span className="truncate font-semibold text-foreground" title={displayName}>{displayName}</span>
                {modelLabel && (
                  <>
                    <span className="shrink-0 text-muted-foreground/60">·</span>
                    <span
                      className="min-w-0 truncate text-xs font-medium text-muted-foreground"
                      title={t('header.modelTitle', { model: modelLabel })}
                    >
                      {modelLabel}
                    </span>
                  </>
                )}
              </ProviderModelMenu>
              <span className="shrink-0 text-muted-foreground/60">·</span>
              <span className={`min-w-0 truncate text-xs ${statusTextClass}`}>
                {statusContent}
              </span>
              {/* Multi-session indicators */}
              {anyProcessing && state !== CHAT_STATES.AWAITING_RESPONSE && (
                <span className="shrink-0 flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20 animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  busy in another tab
                </span>
              )}
              {sessionCount > 1 && (
                <span
                  className="shrink-0 flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400 border border-violet-500/20"
                  title={`${sessionCount} browser tabs connected`}
                >
                  {sessionCount} tabs
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {canShowReconnect && (
              <button
                type="button"
                onClick={onReconnect}
                className="h-8 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-2.5 text-xs font-medium text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-violet-500/30 sm:h-9 sm:px-3"
              >
                {t('header.reconnect')}
              </button>
            )}
            <MoreActionsMenu
              playgroundProps={playgroundProps}
              searchQuery={searchQuery}
              filteredMessagesCount={filteredMessagesCount}
              onSearchChange={onSearchChange}
              statsLabel={statsLabel}
              statsAriaLabel={statsAriaLabel}
              onStartAuth={onStartAuth}
              state={state}
              onOpenFileBrowser={onOpenFileBrowser}
              onToggleTerminal={onToggleTerminal}
              terminalOpen={terminalOpen}
              onToggleDiff={onToggleDiff}
              diffOpen={diffOpen}
              onToggleCli={onToggleCli}
              cliOpen={cliOpen}
              onToggleTonyStarkMode={onToggleTonyStarkMode}
              simplicateMode={simplicateMode}
              onSimplicateModeChange={onSimplicateModeChange}
              onResetConversation={onResetConversation}
            />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className={`border-b border-border/30 bg-card/60 backdrop-blur-xl shrink-0 px-4 pb-3`}
      style={{ minHeight: PANEL_HEADER_MIN_HEIGHT_PX, paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}
    >
      {isMobile && (
        <style>{`
          @keyframes statTick {
            0% { opacity: 0.5; transform: translateY(4px) scale(1.2); }
            60% { opacity: 1; transform: translateY(-1px) scale(1.04); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          .mobile-stat-tick { animation: statTick 0.32s cubic-bezier(0.34, 1.2, 0.64, 1) 1; }
        `}</style>
      )}

      {/* Top row */}
      <div className={`flex items-center justify-between ${HEADER_FIRST_ROW}`}>
        {/* Left: menu + title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 shrink-0 lg:hidden">
            <button
              type="button"
              onClick={onOpenMenu}
              className="flex items-center gap-1.5 rounded-xl bg-transparent p-1.5 text-violet-500 hover:bg-violet-500/10 transition-all active:scale-[0.98]"
              aria-label={t('header.openMenu')}
            >
              <Menu className="size-4 sm:size-5 shrink-0" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <ProviderModelMenu
              triggerClassName="-ml-1 inline-flex max-w-full min-w-0 items-baseline gap-2 px-1 py-0.5 text-left"
              panelLabel={t('header.changeModelEffort')}
              showModelSelector={showModelSelector}
              currentModel={currentModel}
              modelOptions={modelOptions}
              onModelSelect={onModelSelect}
              onModelInputChange={onModelInputChange}
              modelLocked={modelLocked}
              onRefreshModels={onRefreshModels}
              refreshingModels={refreshingModels}
              currentEffort={currentEffort}
              onEffortSelect={onEffortSelect}
            >
              <span className="truncate text-sm font-semibold text-foreground" title={displayName}>{displayName}</span>
              {modelLabel && (
                <span
                  className="max-w-28 truncate text-[11px] font-medium leading-none text-muted-foreground/70 sm:max-w-40"
                  title={t('header.modelTitle', { model: modelLabel })}
                >
                  {modelLabel}
                </span>
              )}
            </ProviderModelMenu>
            <div className="min-h-[14px] mt-0.5 flex items-center gap-2">
              <p className={`text-[10px] sm:text-xs ${statusTextClass}`}>
                {statusContent}
              </p>
              {sessionTimeMs > 0 && (
                <span
                  className="text-[10px] sm:text-xs font-medium tabular-nums text-muted-foreground"
                  title={t('header.sessionTime')}
                >
                  {formatSessionDurationMs(sessionTimeMs)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          {isMobile && (
            <p
              className="text-xs sm:text-sm font-medium tabular-nums leading-none flex items-center gap-0.5 flex-wrap shrink-0 mr-2"
              aria-label={statsAriaLabel}
            >
              <span key={`m-total-${mobileSessionStats.totalActions}`} className="text-foreground mobile-stat-tick" title={t('header.totalActions')}>
                {mobileSessionStats.totalActions}
              </span>
              <span className="text-muted-foreground/70">/</span>
              <span key={`m-done-${mobileSessionStats.completed}`} className="text-emerald-400 mobile-stat-tick" title={t('header.completed')}>
                {mobileSessionStats.completed}
              </span>
              <span className="text-muted-foreground/70">/</span>
              <span key={`m-proc-${mobileSessionStats.processing}`} className="text-cyan-400 mobile-stat-tick" title={t('header.processing')}>
                {mobileSessionStats.processing}
              </span>
              {sessionTokenUsage && (
                <>
                  <span className="text-muted-foreground/70">·</span>
                  <span className="text-violet-300/90" title={t('header.tokenUsage')}>
                    {formatCompactInteger(sessionTokenUsage.inputTokens)} {t('header.inputShort')} / {formatCompactInteger(sessionTokenUsage.outputTokens)} {t('header.outputShort')}
                  </span>
                </>
              )}
            </p>
          )}
          {isMobile && (
            <button
              type="button"
              style={{ display: 'none' }}
              onClick={onOpenActivity}
              className="size-8 sm:size-9 rounded-md flex items-center justify-center hover:bg-violet-500/10 transition-colors shrink-0 relative"
              title={t('header.agentActivity')}
              aria-label={t('header.openAgentActivity')}
            >
              <Brain className={`size-8 ${mobileBrainClasses.brain} transition-colors`} />
              {state === CHAT_STATES.AWAITING_RESPONSE ? (
                <Loader2 className={`size-5 ${mobileBrainClasses.accent} absolute -top-0.5 -right-0.5 animate-spin transition-colors`} aria-hidden />
              ) : (
                <Sparkles className={`size-5 ${mobileBrainClasses.accent} absolute -top-0.5 -right-0.5 animate-pulse transition-colors`} aria-hidden />
              )}
            </button>
          )}
          {canShowReconnect && (
            <button
              type="button"
              onClick={onReconnect}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-gradient-to-r from-violet-600 to-purple-600 text-white border-0 shadow-lg shadow-violet-500/30 hover:opacity-90 transition-opacity"
            >
              {t('header.reconnect')}
            </button>
          )}

          {onToggleTonyStarkMode && (
            <Link
              to="/stark"
              className="p-1 md:p-1.5 rounded-full transition-all text-cyan-500/80 hover:text-cyan-300 hover:bg-cyan-500/10 group flex items-center justify-center transform hover:scale-105 active:scale-95"
              title={t('header.tonyStark')}
            >
              <StarkGlassesIcon className="w-5 h-5 md:w-6 md:h-6 group-hover:drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] transition-all" />
            </Link>
          )}

          {/* Desktop-only: playground selector in top row */}
          <PlaygroundSelectorSlot props={playgroundProps} className="hidden sm:block" />
          <LocaleSelector />
          {/* Desktop-only: conversations toggle */}
          {onToggleConversations && (
            <button
              type="button"
              onClick={onToggleConversations}
              className={`hidden sm:flex size-9 rounded-md items-center justify-center transition-colors shrink-0 ${
                conversationsOpen
                  ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
                  : 'text-muted-foreground hover:bg-violet-500/10 hover:text-violet-300'
              }`}
              title="Conversations"
              aria-label="Toggle conversations"
              aria-pressed={conversationsOpen}
              id="chat-header-conversations-btn"
            >
              <MessageSquare className="size-4" />
            </button>
          )}
          {/* Desktop-only: diff button in top row */}
          {onToggleDiff && (
            <DiffButton open={diffOpen} onToggle={onToggleDiff} className="hidden sm:flex size-9" />
          )}
          {/* Desktop-only: CLI button in top row */}
          {onToggleCli && (
            <CliButton open={cliOpen} onToggle={onToggleCli} className="hidden sm:flex size-9" />
          )}
          {/* Desktop-only: terminal button in top row */}
          {onToggleTerminal && (
            <TerminalButton open={terminalOpen} onToggle={onToggleTerminal} className="hidden sm:flex size-9" />
          )}
          {state === CHAT_STATES.UNAUTHENTICATED && (
            <button
              type="button"
              onClick={onStartAuth}
              className="px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-medium bg-gradient-to-r from-violet-600 to-purple-600 text-white border-0 shadow-lg shadow-violet-500/30 hover:opacity-90 transition-opacity"
            >
              {t('header.startAuth')}
            </button>
          )}
        </div>
      </div>

      {/* Search row — on mobile: [playground icon] [search input] [terminal icon] */}
      <div className="flex items-center gap-1.5 mt-2">
        {/* Mobile-only: playground selector left of search */}
        <PlaygroundSelectorSlot props={playgroundProps} className="sm:hidden shrink-0" />

        {/* Search field */}
        <div className="relative flex-1 h-8">
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

        {/* Mobile-only: diff button right of search, before terminal */}
        {onToggleDiff && (
          <DiffButton open={diffOpen} onToggle={onToggleDiff} className="sm:hidden size-8" />
        )}

        {/* Mobile-only: CLI button right of search */}
        {onToggleCli && (
          <CliButton open={cliOpen} onToggle={onToggleCli} className="sm:hidden size-8" />
        )}

        {/* Mobile-only: terminal button right of search */}
        {onToggleTerminal && (
          <TerminalButton open={terminalOpen} onToggle={onToggleTerminal} className="sm:hidden size-8" />
        )}
      </div>

      {searchQuery && (
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-2">
          {filteredMessagesCount === 1
            ? t('header.foundOne')
            : t('header.foundMany', { count: filteredMessagesCount })}
        </p>
      )}
    </header>
  );
}
