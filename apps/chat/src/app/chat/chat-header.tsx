import { Brain, Command, GitCompareArrows, Loader2, Menu, RefreshCcw, Search, Sparkles, TerminalSquare, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlaygroundSelector } from './playground-selector';
import type { BrowseEntry } from './use-playground-selector';
import { CHAT_STATES, STATE_LABELS, truncateError } from './chat-state';
import { TypewriterText } from './typewriter-text';
import { formatCompactInteger, formatSessionDurationMs } from '../agent-thinking-utils';
import { HEADER_FIRST_ROW, HEADER_PADDING, INPUT_SEARCH, SEARCH_ICON_POSITION, CLEAR_BUTTON_POSITION } from '../ui-classes';
import { PANEL_HEADER_MIN_HEIGHT_PX } from '../layout-constants';

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
}: {
  props: ChatHeaderProps;
  className?: string;
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
      />
    </div>
  );
}

/** CLI Commands toggle button, shared between the desktop top-row and the mobile search-row. */
function CliButton({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className} rounded-md flex items-center justify-center transition-colors shrink-0 ${
        open
          ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
          : 'text-muted-foreground hover:bg-blue-500/10 hover:text-blue-300'
      }`}
      title={open ? 'Close CLI commands' : 'Show CLI commands'}
      aria-label={open ? 'Close CLI commands' : 'Show CLI commands'}
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
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className} rounded-md flex items-center justify-center transition-colors shrink-0 ${
        open
          ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
          : 'text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-300'
      }`}
      title={open ? 'Close diff' : 'Show playground diff'}
      aria-label={open ? 'Close diff' : 'Show playground diff'}
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
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className} rounded-md flex items-center justify-center transition-colors shrink-0 ${
        open
          ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
          : 'text-muted-foreground hover:bg-violet-500/10 hover:text-violet-300'
      }`}
      title={open ? 'Close terminal' : 'Open terminal'}
      aria-label={open ? 'Close terminal' : 'Open terminal'}
      aria-pressed={open}
    >
      <TerminalSquare className="size-4" />
    </button>
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
  ...rest
}: ChatHeaderProps) {
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
    ...rest,
  };

  return (
    <header
      className={`border-b border-border/30 bg-card/60 backdrop-blur-xl shrink-0 ${HEADER_PADDING}`}
      style={{ minHeight: PANEL_HEADER_MIN_HEIGHT_PX }}
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
              aria-label="Open menu"
            >
              <Menu className="size-4 sm:size-5 shrink-0" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="font-semibold text-sm text-foreground truncate" title={displayName}>{displayName}</h2>
              {modelLabel && (
                <span
                  className="max-w-28 truncate text-[11px] font-medium leading-none text-muted-foreground/70 sm:max-w-40"
                  title={`Model: ${modelLabel}`}
                >
                  {modelLabel}
                </span>
              )}
            </div>
            <div className="min-h-[14px] mt-0.5 flex items-center gap-2">
              <p className={`text-[10px] sm:text-xs ${state === CHAT_STATES.AWAITING_RESPONSE ? 'text-warning' : statusClass}`}>
                {state === CHAT_STATES.AWAITING_RESPONSE && agentMode
                  ? <TypewriterText text={agentMode} speed={40} />
                  : state === CHAT_STATES.AGENT_OFFLINE && errorMessage
                  ? truncateError(errorMessage)
                  : STATE_LABELS[state as keyof typeof STATE_LABELS] ?? state}
              </p>
              {sessionTimeMs > 0 && (
                <span
                  className="text-[10px] sm:text-xs font-medium tabular-nums text-muted-foreground"
                  title="Session time"
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
              aria-label={`${mobileSessionStats.totalActions} total / ${mobileSessionStats.completed} completed / ${mobileSessionStats.processing} processing${sessionTokenUsage ? ` / ${sessionTokenUsage.inputTokens} in / ${sessionTokenUsage.outputTokens} out` : ''}`}
            >
              <span key={`m-total-${mobileSessionStats.totalActions}`} className="text-foreground mobile-stat-tick" title="Total actions">
                {mobileSessionStats.totalActions}
              </span>
              <span className="text-muted-foreground/70">/</span>
              <span key={`m-done-${mobileSessionStats.completed}`} className="text-emerald-400 mobile-stat-tick" title="Completed">
                {mobileSessionStats.completed}
              </span>
              <span className="text-muted-foreground/70">/</span>
              <span key={`m-proc-${mobileSessionStats.processing}`} className="text-cyan-400 mobile-stat-tick" title="Processing">
                {mobileSessionStats.processing}
              </span>
              {sessionTokenUsage && (
                <>
                  <span className="text-muted-foreground/70">·</span>
                  <span className="text-violet-300/90" title="Token usage (input / output)">
                    {formatCompactInteger(sessionTokenUsage.inputTokens)} in / {formatCompactInteger(sessionTokenUsage.outputTokens)} out
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
              title="Agent activity"
              aria-label="Open agent activity"
            >
              <Brain className={`size-8 ${mobileBrainClasses.brain} transition-colors`} />
              {state === CHAT_STATES.AWAITING_RESPONSE ? (
                <Loader2 className={`size-5 ${mobileBrainClasses.accent} absolute -top-0.5 -right-0.5 animate-spin transition-colors`} aria-hidden />
              ) : (
                <Sparkles className={`size-5 ${mobileBrainClasses.accent} absolute -top-0.5 -right-0.5 animate-pulse transition-colors`} aria-hidden />
              )}
            </button>
          )}
          {(state === CHAT_STATES.AGENT_OFFLINE || state === CHAT_STATES.ERROR) && (
            <button
              type="button"
              onClick={onReconnect}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-gradient-to-r from-violet-600 to-purple-600 text-white border-0 shadow-lg shadow-violet-500/30 hover:opacity-90 transition-opacity"
            >
              Reconnect
            </button>
          )}

          {onToggleTonyStarkMode && (
            <Link
              to="/stark"
              className="p-1 md:p-1.5 rounded-full transition-all text-cyan-500/80 hover:text-cyan-300 hover:bg-cyan-500/10 group flex items-center justify-center transform hover:scale-105 active:scale-95"
              title="Enter Tony Stark Mode"
            >
              <StarkGlassesIcon className="w-5 h-5 md:w-6 md:h-6 group-hover:drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] transition-all" />
            </Link>
          )}

          {/* Desktop-only: playground selector in top row */}
          <PlaygroundSelectorSlot props={playgroundProps} className="hidden sm:block" />
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
              Start Auth
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
            placeholder="Search in conversation..."
            className={INPUT_SEARCH}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className={CLEAR_BUTTON_POSITION}
              aria-label="Clear search"
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
          Found {filteredMessagesCount} message{filteredMessagesCount !== 1 ? 's' : ''}
        </p>
      )}
    </header>
  );
}
