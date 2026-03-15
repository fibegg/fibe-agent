import { useVirtualizer } from '@tanstack/react-virtual';
import { Brain, CheckCircle2, Download, Loader2, Search, Sparkles, X } from 'lucide-react';
import { memo, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { SidebarToggle } from './sidebar-toggle';
import {
  RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
} from './layout-constants';
import { formatRelativeTime } from './format-relative-time';
import type { ThinkingStep } from './chat/thinking-types';
import { TypingText } from './chat/typing-text';
import {
  getActivityIcon,
  getActivityLabel,
  getBlockVariant,
  formatSessionDurationMs,
  toTimestampMs,
  type StoryEntry,
} from './agent-thinking-utils';
import {
  ACTIVITY_BLOCK_BASE,
  ACTIVITY_BLOCK_VARIANTS,
  ACTIVITY_BODY,
  ACTIVITY_ICON_COLOR,
  ACTIVITY_LABEL,
  ACTIVITY_MONO,
  ACTIVITY_TIMESTAMP,
  CLEAR_BUTTON_POSITION,
  FLEX_ROW_CENTER,
  FLEX_ROW_CENTER_WRAP,
  INPUT_SEARCH,
  SEARCH_ICON_POSITION,
  SIDEBAR_HEADER,
  SIDEBAR_PANEL,
} from './ui-classes';

export type { StoryEntry } from './agent-thinking-utils';

export type SessionActivityEntry = {
  id: string;
  created_at: string;
  story: StoryEntry[];
};

const ACTIVITY_ESTIMATE_HEIGHT = 72;
const ACTIVITY_GAP = 8;
const ACTIVITY_VIRTUALIZE_THRESHOLD = 15;

const STAT_TOOLTIPS = {
  total: 'Total actions',
  completed: 'Completed',
  processing: 'Processing',
  sessionTime: 'Session time',
} as const;

const SINGLE_ROW_TYPES = new Set(['stream_start', 'step', 'tool_call', 'file_created']);

const ActivityBlock = memo(function ActivityBlock({
  entry,
  isStreaming,
}: {
  entry: StoryEntry;
  isStreaming: boolean;
}) {
  const Icon = getActivityIcon(entry.type);
  const label = getActivityLabel(entry.type);
  const variant = getBlockVariant(entry);
  const isCommandBlock = entry.type === 'tool_call' && entry.command;
  const isThinkingBlock =
    entry.type === 'reasoning_start' && (entry.details ?? '').trim().length > 0;
  const isSingleRow = SINGLE_ROW_TYPES.has(entry.type);
  const iconColor = ACTIVITY_ICON_COLOR[entry.type] ?? ACTIVITY_ICON_COLOR.default;

  const singleRowText =
    entry.type === 'file_created'
      ? (entry.path ?? entry.details ?? entry.message)
      : entry.type === 'tool_call' && entry.command
        ? entry.command
        : entry.type === 'step'
          ? entry.message
          : label;

  if (isSingleRow) {
    return (
      <div
        className={`${ACTIVITY_BLOCK_VARIANTS[variant]} px-3 py-1.5 flex items-center justify-between gap-2 min-w-0`}
      >
        <div className={`${FLEX_ROW_CENTER} min-w-0 flex-1 truncate`}>
          <Icon className={`size-4 shrink-0 ${iconColor}`} />
          {isCommandBlock ? (
            <span className="text-[11px] font-mono text-green-300/95 truncate" title={entry.command}>
              <span className="text-amber-400/80 select-none">$ </span>
              <TypingText
                text={entry.command ?? ''}
                charMs={20}
                showCursor={isStreaming}
                skipAnimation={!isStreaming}
              />
            </span>
          ) : (
            <p className={`${ACTIVITY_LABEL} truncate`} title={singleRowText}>
              {singleRowText}
            </p>
          )}
        </div>
        <span className={`${ACTIVITY_TIMESTAMP} shrink-0`}>{formatRelativeTime(entry.timestamp)}</span>
      </div>
    );
  }

  return (
    <div
      className={`${ACTIVITY_BLOCK_VARIANTS[variant]} ${ACTIVITY_BLOCK_BASE}`}
    >
      <div className={FLEX_ROW_CENTER_WRAP}>
        <div className={FLEX_ROW_CENTER}>
          <Icon className={`size-4 shrink-0 ${iconColor}`} />
          <p className={ACTIVITY_LABEL}>{label}</p>
        </div>
        <span className={ACTIVITY_TIMESTAMP}>
          {formatRelativeTime(entry.timestamp)}
        </span>
      </div>
      {isThinkingBlock ? (
        <div className="mt-0.5 rounded-md bg-background/40 px-2.5 py-2 max-h-32 overflow-y-auto">
          <p className={`text-[11px] ${ACTIVITY_MONO}`}>{entry.details}</p>
        </div>
      ) : (
        <div className="mt-0.5">
          <p className={ACTIVITY_BODY}>{entry.message}</p>
          {entry.details && entry.type !== 'reasoning_start' && String(entry.details).trim() !== '{}' && (
            <p className="text-[10px] text-muted-foreground mt-1 truncate" title={entry.details}>
              {entry.details}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

interface AgentThinkingSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
  reasoningText?: string;
  streamingResponseText?: string;
  thinkingSteps?: ThinkingStep[];
  storyItems?: StoryEntry[];
  sessionActivity?: SessionActivityEntry[];
  pastActivityFromMessages?: SessionActivityEntry[];
  mobileOverlay?: boolean;
}

export function AgentThinkingSidebar({
  isCollapsed,
  onToggle,
  isStreaming = false,
  reasoningText = '',
  streamingResponseText = '',
  thinkingSteps = [],
  storyItems = [],
  sessionActivity = [],
  pastActivityFromMessages = [],
  mobileOverlay = false,
}: AgentThinkingSidebarProps) {
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const prevActivityDepsRef = useRef({
    storyLength: 0,
    sessionLength: 0,
    hasThinking: false,
    streaming: false,
  });
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [scrollContainerReady, setScrollContainerReady] = useState(false);
  const setActivityScrollRef = useCallback((el: HTMLDivElement | null) => {
    (activityScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setScrollContainerReady((prev) => (el ? true : prev));
  }, []);
  useEffect(() => {
    if (isCollapsed) setScrollContainerReady(false);
  }, [isCollapsed]);

  const displayThinkingText = reasoningText || streamingResponseText;

  const fullStoryItems = useMemo(() => {
    const past = sessionActivity.length > 0 ? sessionActivity : pastActivityFromMessages;
    const fromPast = past.flatMap((a) => (a.story ?? []).map((s) => ({ ...s, timestamp: s.timestamp })));
    return [...fromPast, ...storyItems];
  }, [sessionActivity, pastActivityFromMessages, storyItems]);

  const sessionStats = useMemo(() => {
    const fromSession = sessionActivity.reduce((acc, t) => acc + (t.story?.length ?? 0), 0);
    const totalActions = fromSession + (isStreaming ? storyItems.length : 0);
    const completed = isStreaming ? Math.max(0, totalActions - 1) : totalActions;
    const processing = isStreaming ? 1 : 0;
    const allEntries = [
      ...sessionActivity.flatMap((t) =>
        (t.story ?? []).map((s) => ({ created_at: t.created_at, ts: s.timestamp }))
      ),
      ...storyItems.map((s) => ({
        created_at: typeof s.timestamp === 'string' ? s.timestamp : (s.timestamp as Date)?.toISOString?.() ?? '',
        ts: s.timestamp,
      })),
    ].filter((e) => e.created_at || e.ts);
    const times = allEntries.map((e) => toTimestampMs(e.ts, e.created_at));
    const firstTs = times.length ? Math.min(...times) : 0;
    const lastTs = times.length ? Math.max(...times) : 0;
    const sessionTimeMs = lastTs && firstTs ? (isStreaming ? Date.now() - firstTs : lastTs - firstTs) : 0;
    return { totalActions, completed, processing, sessionTimeMs };
  }, [sessionActivity, storyItems, isStreaming]);

  const filteredStoryItems = useMemo(() => {
    if (!activitySearchQuery.trim()) return fullStoryItems;
    const q = activitySearchQuery.trim().toLowerCase();
    return fullStoryItems.filter((entry) => {
      const message = (entry.message ?? '').toLowerCase();
      const details = (entry.details ?? '').toLowerCase();
      const command = (entry.command ?? '').toLowerCase();
      const path = (entry.path ?? '').toLowerCase();
      const label = getActivityLabel(entry.type).toLowerCase();
      return (
        message.includes(q) ||
        details.includes(q) ||
        command.includes(q) ||
        path.includes(q) ||
        label.includes(q)
      );
    });
  }, [fullStoryItems, activitySearchQuery]);

  const virtualizer = useVirtualizer({
    count: filteredStoryItems.length,
    getScrollElement: () => activityScrollRef.current,
    estimateSize: () => ACTIVITY_ESTIMATE_HEIGHT,
    gap: ACTIVITY_GAP,
    overscan: 5,
  });
  const useVirtual = filteredStoryItems.length >= ACTIVITY_VIRTUALIZE_THRESHOLD;
  const virtualItems = useVirtual && (scrollContainerReady || activityScrollRef.current)
    ? virtualizer.getVirtualItems()
    : null;
  const virtualTotalHeight = virtualItems ? virtualizer.getTotalSize() : 0;

  useEffect(() => {
    if (isStreaming && displayThinkingText && typeof thinkingScrollRef.current?.scrollIntoView === 'function') {
      thinkingScrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isStreaming, displayThinkingText]);

  useEffect(() => {
    const prev = prevActivityDepsRef.current;
    const fullLength = fullStoryItems.length;
    const hasThinking = !!displayThinkingText;
    const streaming = isStreaming;
    const activityGrew =
      fullLength > prev.storyLength ||
      (hasThinking && !prev.hasThinking) ||
      (streaming && !prev.streaming);
    prevActivityDepsRef.current = {
      storyLength: fullLength,
      sessionLength: sessionActivity.length,
      hasThinking,
      streaming,
    };
    if (activityGrew && typeof activityEndRef.current?.scrollIntoView === 'function') {
      activityEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [fullStoryItems.length, sessionActivity.length, displayThinkingText, isStreaming]);

  const handleDownloadActivity = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sessionStats: {
        totalActions: sessionStats.totalActions,
        completed: sessionStats.completed,
        sessionTimeMs: sessionStats.sessionTimeMs,
      },
      activity: fullStoryItems.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        timestamp: typeof e.timestamp === 'string' ? e.timestamp : (e.timestamp as Date)?.toISOString?.() ?? '',
        ...(e.details !== undefined ? { details: e.details } : {}),
        ...(e.command !== undefined ? { command: e.command } : {}),
        ...(e.path !== undefined ? { path: e.path } : {}),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-activity-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionStats.totalActions, sessionStats.completed, sessionStats.sessionTimeMs, fullStoryItems]);

  return (
    <div
      className={`min-h-0 overflow-hidden ${mobileOverlay ? `${SIDEBAR_PANEL} bg-background` : SIDEBAR_PANEL}`}
      style={{
        width: mobileOverlay
          ? '100%'
          : isCollapsed
            ? RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX
            : RIGHT_SIDEBAR_WIDTH_PX,
      }}
    >
      <style>{`
        @keyframes statTick {
          from { opacity: 0.6; transform: scale(1.06); }
          to { opacity: 1; transform: scale(1); }
        }
        .stat-tick { animation: statTick 0.22s ease-out 1; }
      `}</style>
      <SidebarToggle
        isCollapsed={isCollapsed}
        onClick={onToggle}
        side="right"
        ariaLabel={
          isCollapsed ? 'Expand thinking panel' : 'Collapse thinking panel'
        }
      />

      {!isCollapsed && (
        <div className="shrink-0 px-4 pt-4 flex items-start gap-2">
          <div className="relative shrink-0 pt-1">
            <Brain className="size-5 text-violet-400" />
            <Sparkles
              className="size-3 text-violet-300 absolute -top-1 -right-1 animate-pulse"
              aria-hidden
            />
          </div>
          <p className="px-2 py-1.5 text-[10px] font-medium tabular-nums flex items-center gap-0.5 flex-wrap">
            <span
              key={`total-${sessionStats.totalActions}`}
              className="text-foreground stat-tick inline-block"
              title={STAT_TOOLTIPS.total}
            >
              {sessionStats.totalActions}
            </span>
            <span className="text-muted-foreground/70">/</span>
            <span
              key={`completed-${sessionStats.completed}`}
              className="text-emerald-400 stat-tick inline-block"
              title={STAT_TOOLTIPS.completed}
            >
              {sessionStats.completed}
            </span>
            <span className="text-muted-foreground/70">/</span>
            <span
              key={`processing-${sessionStats.processing}`}
              className="text-cyan-400 stat-tick inline-block"
              title={STAT_TOOLTIPS.processing}
            >
              {sessionStats.processing}
            </span>
            <span className="text-muted-foreground/70">/</span>
            <span
              key={`time-${sessionStats.sessionTimeMs}`}
              className="text-foreground stat-tick inline-block"
              title={STAT_TOOLTIPS.sessionTime}
            >
              {formatSessionDurationMs(sessionStats.sessionTimeMs)}
            </span>
          </p>
          <button
            type="button"
            onClick={handleDownloadActivity}
            className="size-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors shrink-0"
            title="Download activity"
            aria-label="Download activity"
          >
            <Download className="size-4" />
          </button>
        </div>
      )}

      <div className={SIDEBAR_HEADER}>
        {!isCollapsed ? (
          <>
            <div className="relative h-8 mt-2">
              <Search className={SEARCH_ICON_POSITION} aria-hidden />
              <input
                type="text"
                value={activitySearchQuery}
                onChange={(e) => setActivitySearchQuery(e.target.value)}
                placeholder="Search activity..."
                className={INPUT_SEARCH}
                aria-label="Search activity"
              />
              {activitySearchQuery ? (
                <button
                  type="button"
                  onClick={() => setActivitySearchQuery('')}
                  className={CLEAR_BUTTON_POSITION}
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="relative mx-auto">
            <Brain className="size-5 text-violet-400" />
            <Loader2
              className={`size-3 text-violet-300 absolute -top-1 -right-1 ${
                isStreaming ? 'animate-spin' : ''
              }`}
            />
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div
          ref={setActivityScrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3"
        >
          <div className="flex flex-col gap-2">
            {filteredStoryItems.length === 0 &&
              fullStoryItems.length === 0 &&
              !displayThinkingText &&
              !isStreaming && (
                <p className="py-3 text-xs text-muted-foreground">
                  Activity will appear here when the agent responds.
                </p>
              )}
            {filteredStoryItems.length === 0 &&
              fullStoryItems.length > 0 &&
              activitySearchQuery.trim() && (
                <p className="py-3 text-xs text-muted-foreground">
                  No activity matches &quot;{activitySearchQuery.trim()}&quot;.
                </p>
              )}
            {filteredStoryItems.length > 0 && virtualItems ? (
              <div
                className="w-full relative"
                style={
                  {
                    height: virtualTotalHeight,
                    contain: 'layout paint',
                  } as React.CSSProperties
                }
              >
                {virtualItems.map((virtualRow) => {
                  const entry = filteredStoryItems[virtualRow.index];
                  return (
                    <div
                      key={`activity-${virtualRow.index}-${entry.id}`}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      className="absolute left-0 w-full"
                      style={{
                        top: virtualRow.start,
                        minHeight: virtualRow.size,
                      }}
                    >
                      <ActivityBlock entry={entry} isStreaming={isStreaming} />
                    </div>
                  );
                })}
              </div>
            ) : filteredStoryItems.length > 0 ? (
              filteredStoryItems.map((entry, index) => (
                <ActivityBlock
                  key={`activity-${index}-${entry.id}`}
                  entry={entry}
                  isStreaming={isStreaming}
                />
              ))
            ) : null}
            {(displayThinkingText || isStreaming) && (
              <div
                className={`${ACTIVITY_BLOCK_VARIANTS.reasoning} ${ACTIVITY_BLOCK_BASE} ${isStreaming ? 'animate-pulse' : ''}`}
              >
                <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide">
                  {reasoningText ? 'Reasoning' : 'Response'}
                </p>
                <div className={ACTIVITY_MONO}>
                  {displayThinkingText || (isStreaming ? '…' : '')}
                  <span
                    ref={thinkingScrollRef}
                    className="inline-block min-h-0"
                    aria-hidden
                  />
                </div>
              </div>
            )}
            {!isStreaming && filteredStoryItems.length > 0 && (
              <div
                className={`${ACTIVITY_BLOCK_VARIANTS.task_complete} ${ACTIVITY_BLOCK_BASE} ${FLEX_ROW_CENTER_WRAP}`}
              >
                <div className={FLEX_ROW_CENTER}>
                  <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                  <p className={ACTIVITY_LABEL}>Task complete</p>
                </div>
                <span className={ACTIVITY_TIMESTAMP}>just now</span>
              </div>
            )}
            <div ref={activityEndRef} className="h-0 shrink-0" aria-hidden />
          </div>
        </div>
      )}

      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center justify-start pt-8 gap-4">
          <div className="relative">
            <Brain className="size-6 text-violet-400" />
            <Loader2
              className={`size-3 text-violet-300 absolute -bottom-1 -right-1 ${
                isStreaming ? 'animate-spin' : ''
              }`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
