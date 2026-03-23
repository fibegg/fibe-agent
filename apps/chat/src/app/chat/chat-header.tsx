import { Brain, Loader2, Menu, Search, Sparkles, X } from 'lucide-react';
import { ModelSelector } from './model-selector';
import { CHAT_STATES } from './chat-state';
import { STATE_LABELS, truncateError } from './chat-state';
import { formatCompactInteger, formatSessionDurationMs } from '../agent-thinking-utils';
import { HEADER_FIRST_ROW, HEADER_PADDING, INPUT_SEARCH, SEARCH_ICON_POSITION, SEARCH_ROW_WRAPPER, CLEAR_BUTTON_POSITION } from '../ui-classes';
import { PANEL_HEADER_MIN_HEIGHT_PX } from '../layout-constants';

export interface ChatHeaderProps {
  isMobile: boolean;
  state: string;
  errorMessage: string | null;
  sessionTimeMs: number;
  mobileSessionStats: { totalActions: number; completed: number; processing: number };
  sessionTokenUsage?: { inputTokens: number; outputTokens: number } | null;
  mobileBrainClasses: { brain: string; accent: string };
  statusClass: string;
  showModelSelector: boolean;
  currentModel: string;
  modelOptions: string[];
  searchQuery: string;
  filteredMessagesCount: number;
  onSearchChange: (value: string) => void;
  onModelSelect: (model: string) => void;
  onModelInputChange: (value: string) => void;
  onReconnect: () => void;
  onStartAuth: () => void;
  onOpenMenu: () => void;
  onOpenActivity: () => void;
  modelLocked: boolean;
  onRefreshModels?: () => void;
  refreshingModels?: boolean;
}

export function ChatHeader({
  isMobile,
  state,
  errorMessage,
  sessionTimeMs,
  mobileSessionStats,
  sessionTokenUsage = null,
  mobileBrainClasses,
  statusClass,
  showModelSelector,
  currentModel,
  modelOptions,
  searchQuery,
  filteredMessagesCount,
  onSearchChange,
  onModelSelect,
  onModelInputChange,
  onReconnect,
  onStartAuth,
  onOpenMenu,
  onOpenActivity,
  modelLocked,
  onRefreshModels,
  refreshingModels,
}: ChatHeaderProps) {
  return (
    <header
      className={`border-b border-border/50 bg-card/40 backdrop-blur-xl shrink-0 ${HEADER_PADDING}`}
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
      <div className={`flex items-center justify-between ${HEADER_FIRST_ROW}`}>
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
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-semibold text-sm text-foreground truncate">fibe</h2>
              {sessionTimeMs > 0 && (
                <span
                  className="text-[10px] sm:text-xs font-medium tabular-nums text-foreground"
                  title="Session time"
                >
                  {formatSessionDurationMs(sessionTimeMs)}
                </span>
              )}
            </div>
            <div className="min-h-[14px] mt-0.5 flex items-center">
              <p
                className={`text-[10px] sm:text-xs ${state === CHAT_STATES.AWAITING_RESPONSE ? 'text-warning' : statusClass}`}
              >
                {state === CHAT_STATES.AGENT_OFFLINE && errorMessage
                  ? truncateError(errorMessage)
                  : STATE_LABELS[state as keyof typeof STATE_LABELS] ?? state}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          {isMobile && (
            <p
              className="text-xs sm:text-sm font-medium tabular-nums leading-none flex items-center gap-0.5 flex-wrap shrink-0 mr-2"
              aria-label={`${mobileSessionStats.totalActions} total / ${mobileSessionStats.completed} completed / ${mobileSessionStats.processing} processing${sessionTokenUsage ? ` / ${sessionTokenUsage.inputTokens} in / ${sessionTokenUsage.outputTokens} out` : ''}`}
            >
              <span
                key={`m-total-${mobileSessionStats.totalActions}`}
                className="text-foreground mobile-stat-tick"
                title="Total actions"
              >
                {mobileSessionStats.totalActions}
              </span>
              <span className="text-muted-foreground/70">/</span>
              <span
                key={`m-done-${mobileSessionStats.completed}`}
                className="text-emerald-400 mobile-stat-tick"
                title="Completed"
              >
                {mobileSessionStats.completed}
              </span>
              <span className="text-muted-foreground/70">/</span>
              <span
                key={`m-proc-${mobileSessionStats.processing}`}
                className="text-cyan-400 mobile-stat-tick"
                title="Processing"
              >
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
              onClick={onOpenActivity}
              className="size-8 sm:size-9 rounded-md flex items-center justify-center hover:bg-violet-500/10 transition-colors shrink-0 relative"
              title="Agent activity"
              aria-label="Open agent activity"
            >
              <Brain className={`size-8 ${mobileBrainClasses.brain} transition-colors`} />
              {state === CHAT_STATES.AWAITING_RESPONSE ? (
                <Loader2
                  className={`size-5 ${mobileBrainClasses.accent} absolute -top-0.5 -right-0.5 animate-spin transition-colors`}
                  aria-hidden
                />
              ) : (
                <Sparkles
                  className={`size-5 ${mobileBrainClasses.accent} absolute -top-0.5 -right-0.5 animate-pulse transition-colors`}
                  aria-hidden
                />
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
          <ModelSelector
            currentModel={currentModel}
            options={modelOptions}
            onSelect={onModelSelect}
            onInputChange={onModelInputChange}
            visible={showModelSelector}
            modelLocked={modelLocked}
            onRefresh={onRefreshModels}
            refreshing={refreshingModels}
          />
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
      <div className={SEARCH_ROW_WRAPPER}>
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
      {searchQuery && (
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-2">
          Found {filteredMessagesCount} message{filteredMessagesCount !== 1 ? 's' : ''}
        </p>
      )}
    </header>
  );
}
