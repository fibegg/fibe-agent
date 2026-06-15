import { useEffect, useMemo, useRef } from 'react';
import {
  Brain,
  Loader2,
  Menu,
  MessageSquare,
  MonitorUp,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BrowseEntry } from './use-playground-selector';
import { CHAT_STATES, truncateError } from './chat-state';
import { getChatStateLabel, type ChatState } from './chat-state';
import { TypewriterText } from './typewriter-text';
import { formatCompactInteger, formatSessionDurationMs } from '../agent-thinking-utils';
import { HEADER_FIRST_ROW, INPUT_SEARCH, SEARCH_ICON_POSITION, CLEAR_BUTTON_POSITION } from '../ui-classes';
import { PANEL_HEADER_MIN_HEIGHT_PX } from '../layout-constants';
import { LocaleSelector } from '../locale-selector';
import { useT } from '../i18n';
import { CliButton, DiffButton, TerminalButton, StarkGlassesIcon } from './chat-header-controls';
import { MoreActionsMenu, ProviderModelMenu, CompactConversationPicker } from './chat-header-menus';

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
  onTogglePreview?: () => void;
  previewOpen?: boolean;
  previewAvailable?: boolean;
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

function isKnownChatState(state: string): state is ChatState {
  return Object.values(CHAT_STATES).includes(state as ChatState);
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
  onTogglePreview,
  previewOpen = false,
  previewAvailable = false,
  onToggleCli,
  cliOpen = false,
  tonyStarkMode = false,
  onToggleTonyStarkMode,
  simplicateMode = false,
  onSimplicateModeChange,
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
}: ChatHeaderProps) {
  const t = useT();
  const displayName = agentName || agentProviderLabel?.trim() || 'Agent';
  const modelLabel = currentModel?.trim() ?? '';
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
  const menuButtonLabel = t('header.openMenu');
  const compactShowsProviderModel = state === CHAT_STATES.AUTHENTICATED;
  const mobileHeaderRef = useRef<HTMLElement>(null);
  const busyBadge =
    anyProcessing && state !== CHAT_STATES.AWAITING_RESPONSE ? (
      <span className="shrink-0 flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20 animate-pulse">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        {t('header.busyInAnotherTab')}
      </span>
    ) : null;
  const sessionBadge =
    sessionCount > 1 ? (
      <span
        className="shrink-0 flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/20"
        title={t('header.tabsConnected', { count: sessionCount })}
      >
        {t('header.tabCount', { count: sessionCount })}
      </span>
    ) : null;

  useEffect(() => {
    if (!isMobile) return;
    const el = mobileHeaderRef.current;
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
        ref={mobileHeaderRef}
        className="border-b border-border bg-[var(--pwa-safe-area-bg)] px-3 pb-2 shrink-0 sm:px-4 relative z-30"
        style={{
          paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0.5rem))',
          willChange: 'transform',
        }}
      >
        <div className="flex h-10 items-center justify-between gap-2">
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-transparent text-primary transition-colors hover:bg-primary/10 active:scale-[0.98] sm:size-9"
            aria-label={menuButtonLabel}
            title={menuButtonLabel}
          >
            <Menu className="size-4 sm:size-5" />
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
              {sessionBadge}
              {compactShowsProviderModel ? (
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
              ) : (
                <span className={`min-w-0 truncate text-xs ${statusTextClass}`}>
                  {statusContent}
                </span>
              )}
              {busyBadge}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {canShowReconnect && (
              <button
                type="button"
                onClick={onReconnect}
                className="h-8 rounded-lg bg-gradient-to-r from-primary to-secondary px-2.5 text-xs font-medium text-white shadow-lg shadow-primary/25 transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:h-9 sm:px-3"
              >
                {t('header.reconnect')}
              </button>
            )}
            <MoreActionsMenu
              playgroundProps={{ isMobile, agentName, agentProvider, agentProviderLabel, currentModel, state, agentMode, errorMessage, sessionTimeMs, mobileSessionStats, sessionTokenUsage, mobileBrainClasses, statusClass, searchQuery, filteredMessagesCount, onSearchChange, onReconnect, onStartAuth, onOpenMenu, onOpenActivity, onToggleTerminal, terminalOpen, onToggleDiff, diffOpen, onToggleCli, cliOpen, tonyStarkMode, onToggleTonyStarkMode, simplicateMode, onSimplicateModeChange, currentEffort, onEffortSelect, showModelSelector, modelOptions, onModelSelect, onModelInputChange, modelLocked, onRefreshModels, refreshingModels, onResetConversation, sessionCount, anyProcessing, onToggleConversations, conversationsOpen, conversations, activeConversationId, onConversationSelect, onConversationCreate }}
              searchQuery={searchQuery}
              filteredMessagesCount={filteredMessagesCount}
              onSearchChange={onSearchChange}
              statsLabel={statsLabel}
              statsAriaLabel={statsAriaLabel}
              onStartAuth={onStartAuth}
              state={state}
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
      ref={mobileHeaderRef}
      className="border-b border-border bg-[var(--pwa-safe-area-bg)] shrink-0 px-4 pb-3"
      style={{
        minHeight: PANEL_HEADER_MIN_HEIGHT_PX,
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))',
        willChange: 'transform',
      }}
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
              className="flex items-center gap-1.5 rounded-xl bg-transparent p-1.5 text-primary hover:bg-primary/10 transition-all active:scale-[0.98]"
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
                  <span className="text-primary/90" title={t('header.tokenUsage')}>
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
              className="size-8 sm:size-9 rounded-md flex items-center justify-center hover:bg-primary/10 transition-colors shrink-0 relative"
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
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-gradient-to-r from-primary to-secondary text-white border-0 shadow-lg shadow-primary/30 hover:opacity-90 transition-opacity"
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

          <LocaleSelector />
          {/* Desktop-only: conversations toggle */}
          {onToggleConversations && (
            <button
              type="button"
              onClick={onToggleConversations}
              className={`hidden sm:flex size-9 rounded-md items-center justify-center transition-colors shrink-0 ${
                conversationsOpen
                  ? 'bg-primary/20 text-primary hover:bg-primary/30'
                  : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
              }`}
              title={t('header.conversations')}
              aria-label={t('header.toggleConversations')}
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
          {onTogglePreview && previewAvailable && (
            <button
              type="button"
              onClick={onTogglePreview}
              className={`hidden sm:flex size-9 rounded-md items-center justify-center transition-colors shrink-0 ${
                previewOpen
                  ? 'bg-primary/20 text-primary hover:bg-primary/30'
                  : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
              }`}
              title={t('preview.title')}
              aria-label={t('preview.toggle')}
              aria-pressed={previewOpen}
            >
              <MonitorUp className="size-4" />
            </button>
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
              className="px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-medium bg-gradient-to-r from-primary to-secondary text-white border-0 shadow-lg shadow-primary/30 hover:opacity-90 transition-opacity"
            >
              {t('header.startAuth')}
            </button>
          )}
        </div>
      </div>

      {/* Search row */}
      <div className="flex items-center gap-1.5 mt-2">
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
        {onTogglePreview && previewAvailable && (
          <button
            type="button"
            onClick={onTogglePreview}
            className={`sm:hidden size-8 rounded-md items-center justify-center transition-colors shrink-0 ${
              previewOpen
                ? 'bg-primary/20 text-primary hover:bg-primary/30'
                : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
            }`}
            title={t('preview.title')}
            aria-label={t('preview.toggle')}
            aria-pressed={previewOpen}
          >
            <MonitorUp className="size-4" />
          </button>
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
