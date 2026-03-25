import { useVirtualizer } from '@tanstack/react-virtual';
import { Brain, CheckCircle2, Loader2, Search, Sparkles, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useRef, useEffect, useState, useCallback } from 'react';
import { SidebarToggle } from './sidebar-toggle';
import { CountUpNumber } from './count-up-number';
import {
  PANEL_HEADER_MIN_HEIGHT_PX,
  RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
} from './layout-constants';
import type { ThinkingStep } from './chat/thinking-types';
import {
  getBlockVariant,
  type StoryEntry,
} from './agent-thinking-utils';
import {
  ACTIVITY_BLOCK_BASE,
  ACTIVITY_BLOCK_VARIANTS,
  ACTIVITY_LABEL,
  ACTIVITY_MONO,
  ACTIVITY_TIMESTAMP,
  CLEAR_BUTTON_POSITION,
  FLEX_ROW_CENTER,
  INPUT_SEARCH,
  HEADER_FIRST_ROW,
  SEARCH_ICON_POSITION,
  SEARCH_ROW_WRAPPER,
  SIDEBAR_HEADER,
  SIDEBAR_PANEL,
} from './ui-classes';

import { ActivityBlock, CommandGroupBlock, ThinkingTextWithHighlights, type DisplayItem, type SessionActivityEntry, activityHoverContent, } from './agent-thinking-blocks';
import { useThinkingSidebarData } from './use-thinking-sidebar-data';
export type { StoryEntry, SessionActivityEntry } from './agent-thinking-blocks';

const ACTIVITY_ESTIMATE_HEIGHT = 32;
const ACTIVITY_GAP = 8;
const ACTIVITY_VIRTUALIZE_THRESHOLD = 15;
const ACTIVITY_SCROLL_AT_BOTTOM_PX = 2;
const REASONING_MAX_HEIGHT_RATIO = 0.75;



const STAT_TOOLTIPS = {
  total: 'Total actions',
  completed: 'Completed',
  processing: 'Processing',
} as const;

const STAT_TOOLTIP_POPOVER_CLASS =
  'pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 rounded px-2 py-1 text-[10px] font-medium bg-popover text-popover-foreground border border-border shadow-md opacity-0 transition-opacity duration-150 whitespace-nowrap group-hover/stat:opacity-100';

const ACTIVITY_DOT_COLOR: Record<string, string> = {
  stream_start: 'bg-blue-500',
  reasoning: 'bg-violet-500',
  step: 'bg-zinc-500',
  tool_call: 'bg-amber-500',
  file_created: 'bg-green-500',
  task_complete: 'bg-green-500',
  default: 'bg-violet-500',
};

const ACTIVITY_CIRCLE_LETTER: Record<string, string> = {
  stream_start: 'S',
  reasoning: 'R',
  step: 'P',
  tool_call: 'C',
  file_created: 'F',
  task_complete: '✓',
  default: 'A',
};

const ACTIVITY_COLOR_HEX: Record<string, string> = {
  stream_start: '#3b82f6',
  reasoning: '#8b5cf6',
  step: '#71717a',
  tool_call: '#f59e0b',
  file_created: '#22c55e',
  task_complete: '#22c55e',
  default: '#8b5cf6',
};


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
  sessionTokenUsage?: { inputTokens: number; outputTokens: number } | null;
  mobileOverlay?: boolean;
  onActivityClick?: (payload: { activityId: string; storyId?: string }) => void;
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
  sessionTokenUsage = null,
  mobileOverlay = false,
  onActivityClick,
}: AgentThinkingSidebarProps) {
  const latestActivityId =
    sessionActivity.length > 0 ? sessionActivity[sessionActivity.length - 1].id : undefined;
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const prevActivityDepsRef = useRef({
    storyLength: 0,
    sessionLength: 0,
    hasThinking: false,
    streaming: false,
  });
  const scrolledActivityOnOpenRef = useRef(false);
  const [scrollContainerReady, setScrollContainerReady] = useState(false);
  const [downloadAnimating, setDownloadAnimating] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [copyTooltipAnchor, setCopyTooltipAnchor] = useState<{ centerX: number; bottom: number } | null>(null);
  const [reasoningMaxHeightPx, setReasoningMaxHeightPx] = useState<number | null>(null);
  const [activityTooltip, setActivityTooltip] = useState<{
    rect: { left: number; top: number; height: number };
    content: string;
    variant: string;
  } | null>(null);
  const brainButtonRef = useRef<HTMLDivElement>(null);
  const setActivityScrollRef = useCallback((el: HTMLDivElement | null) => {
    (activityScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setScrollContainerReady((prev) => (el ? true : prev));
  }, []);
  useEffect(() => {
    if (isCollapsed) {
      setScrollContainerReady(false);
      scrolledActivityOnOpenRef.current = false;
    }
  }, [isCollapsed]);

  useEffect(() => {
    const el = activityScrollRef.current;
    const hasReasoning = !!(reasoningText || streamingResponseText || isStreaming);
    if (!el || !hasReasoning || typeof ResizeObserver === 'undefined') return;
    const setMax = () => setReasoningMaxHeightPx(Math.floor(el.clientHeight * REASONING_MAX_HEIGHT_RATIO));
    setMax();
    const ro = new ResizeObserver(setMax);
    ro.observe(el);
    return () => ro.disconnect();
  }, [reasoningText, streamingResponseText, isStreaming, scrollContainerReady]);

  const displayThinkingText = reasoningText || streamingResponseText;

  const {
    activitySearchQuery,
    setActivitySearchQuery,
    fullStoryItems,
    filteredStoryItems,
    sessionStats,
    brainClasses,
    lastStreamStartId,
    currentRunIds,
    displayList
  } = useThinkingSidebarData({
    isStreaming,
    storyItems,
    sessionActivity,
    pastActivityFromMessages
  });

  const virtualizer = useVirtualizer({
    count: displayList.length,
    getScrollElement: () => activityScrollRef.current,
    estimateSize: () => ACTIVITY_ESTIMATE_HEIGHT,
    gap: ACTIVITY_GAP,
    overscan: 5,
  });
  const useVirtual = displayList.length >= ACTIVITY_VIRTUALIZE_THRESHOLD;
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

  useEffect(() => {
    if (isCollapsed || !scrollContainerReady || displayList.length === 0 || scrolledActivityOnOpenRef.current) return;
    scrolledActivityOnOpenRef.current = true;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const endEl = activityEndRef.current;
        if (cancelled || !endEl || typeof endEl.scrollIntoView !== 'function') return;
        endEl.scrollIntoView({ behavior: 'auto' });
        requestAnimationFrame(() => {
          const s = activityScrollRef.current;
          const atBottom = s ? s.scrollHeight - s.scrollTop - s.clientHeight <= ACTIVITY_SCROLL_AT_BOTTOM_PX : false;
          if (!atBottom && activityEndRef.current) {
            activityEndRef.current.scrollIntoView({ behavior: 'auto' });
          }
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [isCollapsed, scrollContainerReady, displayList.length]);

  const runCopyWithAnimation = useCallback(async () => {
    if (downloadAnimating) return;
    setDownloadAnimating(true);
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
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      const rect = brainButtonRef.current?.getBoundingClientRect();
      if (rect) {
        setCopyTooltipAnchor({ centerX: rect.left + rect.width / 2, bottom: rect.bottom });
      }
      setCopiedToClipboard(true);
      setTimeout(() => {
        setCopiedToClipboard(false);
        setCopyTooltipAnchor(null);
      }, 2500);
    } finally {
      setTimeout(() => setDownloadAnimating(false), 2200);
    }
  }, [sessionStats.totalActions, sessionStats.completed, sessionStats.sessionTimeMs, fullStoryItems, downloadAnimating]);

  return (
    <div
      className={`relative min-h-0 flex flex-col ${mobileOverlay ? `${SIDEBAR_PANEL} bg-background` : SIDEBAR_PANEL}`}
      style={{
        width: mobileOverlay
          ? '100%'
          : isCollapsed
            ? RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX
            : RIGHT_SIDEBAR_WIDTH_PX,
      }}
    >
      <SidebarToggle
        isCollapsed={isCollapsed}
        onClick={onToggle}
        side="right"
        ariaLabel={
          isCollapsed ? 'Expand thinking panel' : 'Collapse thinking panel'
        }
      />
      <div className="min-h-0 overflow-visible flex-1 flex flex-col min-w-0">
      <style>{`
        @keyframes statTick {
          0% { opacity: 0.5; transform: translateY(4px) scale(1.2); }
          60% { opacity: 1; transform: translateY(-1px) scale(1.04); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .stat-tick { animation: statTick 0.32s cubic-bezier(0.34, 1.2, 0.64, 1) 1; }
        @keyframes brainDownloadPulse {
          0% { transform: scale(1); opacity: 1; color: inherit; }
          12% { transform: scale(1.25); opacity: 1; color: inherit; }
          25% { transform: scale(1); opacity: 1; color: inherit; }
          37% { transform: scale(1.2); opacity: 1; color: inherit; }
          50% { transform: scale(1); opacity: 1; color: inherit; }
          62% { transform: scale(1); opacity: 1; color: rgb(239 68 68); }
          75% { transform: scale(1); opacity: 1; color: rgb(239 68 68); }
          100% { transform: scale(6); opacity: 0; color: rgb(239 68 68); }
        }
        .brain-download-anim { animation: brainDownloadPulse 2.2s ease-in-out forwards; }
      `}</style>
      <div className={SIDEBAR_HEADER} style={{ minHeight: PANEL_HEADER_MIN_HEIGHT_PX }}>
        {!isCollapsed ? (
          <>
            <div className={`flex items-center gap-2 ${HEADER_FIRST_ROW} overflow-visible`}>
              <div ref={brainButtonRef} className="relative shrink-0 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => void runCopyWithAnimation()}
                  className="relative rounded-md hover:bg-muted/50 transition-colors cursor-pointer border-0 bg-transparent p-0"
                  aria-label="Activity"
                  disabled={downloadAnimating}
                >
                  {downloadAnimating ? (
                    <span className="inline-flex items-center justify-center text-violet-400" aria-hidden>
                      <Brain className="size-8 brain-download-anim" />
                    </span>
                  ) : (
                    <>
                      <Brain className={`size-8 ${brainClasses.brain} transition-colors`} />
                      {isStreaming ? (
                        <Loader2
                          className={`size-5 ${brainClasses.accent} absolute -top-0.5 -right-0.5 animate-spin transition-colors`}
                          aria-hidden
                        />
                      ) : (
                        <Sparkles
                          className={`size-5 ${brainClasses.accent} absolute -top-0.5 -right-0.5 animate-pulse transition-colors`}
                          aria-hidden
                        />
                      )}
                    </>
                  )}
                </button>
              </div>
              {copiedToClipboard &&
                copyTooltipAnchor &&
                typeof document !== 'undefined' &&
                createPortal(
                  <span
                    className="pointer-events-none fixed z-[9999] rounded px-2 py-1 text-[10px] font-medium bg-popover text-popover-foreground border border-border shadow-lg whitespace-nowrap"
                    role="status"
                    style={{
                      left: copyTooltipAnchor.centerX,
                      top: copyTooltipAnchor.bottom + 8,
                      transform: 'translate(-50%, 0)',
                    }}
                  >
                    Copied to clipboard
                  </span>,
                  document.body
                )}
              {sessionStats.totalActions === 0 &&
              sessionStats.completed === 0 &&
              sessionStats.processing === 0 ? (
                <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground italic max-w-[200px] leading-none flex items-center">
                  These are not the droids you deepseek.
                </p>
              ) : (
                <p className="px-2 py-1.5 text-xs font-medium tabular-nums leading-none flex items-center gap-0.5 flex-wrap">
                  <span
                    key={`total-${sessionStats.totalActions}`}
                    className="group/stat relative inline-block cursor-help rounded px-0.5 py-0.5 -my-0.5 -mx-0.5"
                    title={STAT_TOOLTIPS.total}
                  >
                    <span className="text-foreground stat-tick"><CountUpNumber value={sessionStats.totalActions} format="raw" /></span>
                    <span className={STAT_TOOLTIP_POPOVER_CLASS} role="tooltip">
                      {STAT_TOOLTIPS.total}
                    </span>
                  </span>
                  <span className="text-muted-foreground/70">/</span>
                  <span
                    key={`completed-${sessionStats.completed}`}
                    className="group/stat relative inline-block cursor-help rounded px-0.5 py-0.5 -my-0.5 -mx-0.5"
                    title={STAT_TOOLTIPS.completed}
                  >
                    <span className="text-emerald-400 stat-tick"><CountUpNumber value={sessionStats.completed} format="raw" /></span>
                    <span className={STAT_TOOLTIP_POPOVER_CLASS} role="tooltip">
                      {STAT_TOOLTIPS.completed}
                    </span>
                  </span>
                  <span className="text-muted-foreground/70">/</span>
                  <span
                    key={`processing-${sessionStats.processing}`}
                    className="group/stat relative inline-block cursor-help rounded px-0.5 py-0.5 -my-0.5 -mx-0.5"
                    title={STAT_TOOLTIPS.processing}
                  >
                    <span className="text-cyan-400 stat-tick"><CountUpNumber value={sessionStats.processing} format="raw" /></span>
                    <span className={STAT_TOOLTIP_POPOVER_CLASS} role="tooltip">
                      {STAT_TOOLTIPS.processing}
                    </span>
                  </span>
                  {sessionTokenUsage && (
                    <>
                      <span className="text-muted-foreground/70">·</span>
                      <span
                        className="text-violet-300/90"
                        title="Token usage (input / output)"
                      >
                        <CountUpNumber value={sessionTokenUsage.inputTokens} format="compact" /> in / <CountUpNumber value={sessionTokenUsage.outputTokens} format="compact" /> out
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
            <div className={SEARCH_ROW_WRAPPER}>
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
          <button
            type="button"
            onClick={() => void runCopyWithAnimation()}
            disabled={downloadAnimating}
            className="flex flex-col items-center gap-1.5 w-full rounded-md hover:bg-muted/50 transition-colors cursor-pointer border-0 bg-transparent p-0"
            aria-label="Copy activity to clipboard"
          >
            <div className="relative shrink-0">
              <Brain className={`size-5 ${brainClasses.brain} transition-colors`} />
              {isStreaming ? (
                <Loader2
                  className={`size-3 ${brainClasses.accent} absolute -top-1 -right-1 animate-spin transition-colors`}
                />
              ) : (
                <Sparkles
                  className={`size-3 ${brainClasses.accent} absolute -top-1 -right-1 animate-pulse transition-colors`}
                />
              )}
            </div>
            <div
              className="grid grid-cols-1 gap-px text-[10px] font-medium tabular-nums text-center text-muted-foreground [&>*]:bg-muted/30 [&>*]:rounded [&>*]:py-0.5 [&>*]:min-w-0"
              aria-label="Total / Completed / Processing"
            >
              <span key={`total-${sessionStats.totalActions}`} className="text-foreground stat-tick" title={STAT_TOOLTIPS.total}>
                {sessionStats.totalActions}
              </span>
              <span key={`completed-${sessionStats.completed}`} className="text-emerald-400 stat-tick" title={STAT_TOOLTIPS.completed}>
                {sessionStats.completed}
              </span>
              <span key={`processing-${sessionStats.processing}`} className="text-cyan-400 stat-tick" title={STAT_TOOLTIPS.processing}>
                {sessionStats.processing}
              </span>
            </div>
          </button>
        )}
      </div>

      {isCollapsed && displayList.length > 0 && (() => {
        const taskCompleteEntry: DisplayItem = {
          kind: 'entry',
          entry: { id: 'task-complete', type: 'task_complete', message: 'Task complete', timestamp: '' },
        };
        const collapsedChainList =
          !isStreaming && displayList.length > 0 ? [...displayList, taskCompleteEntry] : displayList;
        return (
        <div className="flex-1 min-h-0 overflow-y-auto min-w-0" aria-label="Activity summary">
          <div className="p-3 flex flex-col items-center gap-0">
          {collapsedChainList.map((item, i) => {
            const variant = item.kind === 'entry' ? getBlockVariant(item.entry) : 'tool_call';
            const bgColor = ACTIVITY_DOT_COLOR[variant] ?? ACTIVITY_DOT_COLOR.default;
            const hexColor = ACTIVITY_COLOR_HEX[variant] ?? ACTIVITY_COLOR_HEX.default;
            const prevItem = i > 0 ? collapsedChainList[i - 1] : null;
            const prevVariant = prevItem?.kind === 'entry' ? getBlockVariant(prevItem.entry) : prevItem ? 'tool_call' : null;
            const prevHex = prevVariant !== null ? (ACTIVITY_COLOR_HEX[prevVariant] ?? ACTIVITY_COLOR_HEX.default) : null;
            const letter = ACTIVITY_CIRCLE_LETTER[variant] ?? ACTIVITY_CIRCLE_LETTER.default;
            const isLast = i === collapsedChainList.length - 1;
            const hoverText = activityHoverContent(item);
            return (
              <span key={item.kind === 'entry' ? item.entry.id : item.id} className="flex flex-col items-center gap-0">
                {i > 0 && prevHex !== null && (
                  <div
                    className="w-0.5 h-2 shrink-0 rounded-full"
                    style={{ background: `linear-gradient(to bottom, ${prevHex}, ${hexColor})` }}
                    aria-hidden
                  />
                )}
                <span
                  className={`relative inline-flex items-center justify-center size-5 rounded-full shrink-0 text-[10px] font-semibold text-white ${bgColor} ${isLast && isStreaming ? 'animate-pulse' : ''} cursor-default`}
                  title={hoverText}
                  onMouseEnter={(e) =>
                    setActivityTooltip({
                      rect: e.currentTarget.getBoundingClientRect(),
                      content: hoverText,
                      variant,
                    })
                  }
                  onMouseLeave={() => setActivityTooltip(null)}
                >
                  {letter}
                </span>
              </span>
            );
          })}
          </div>
        </div>
        );
      })()}

      {!isCollapsed && (
        <div
          ref={setActivityScrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2"
        >
          <div className="flex flex-col gap-2">
            {filteredStoryItems.length === 0 &&
              fullStoryItems.length === 0 &&
              !displayThinkingText &&
              !isStreaming && (
                <p className="py-2 text-xs text-muted-foreground">
                  Activity will appear here when the agent responds.
                </p>
              )}
            {filteredStoryItems.length === 0 &&
              fullStoryItems.length > 0 &&
              activitySearchQuery.trim() && (
                <p className="py-2 text-xs text-muted-foreground">
                  No activity matches &quot;{activitySearchQuery.trim()}&quot;.
                </p>
              )}
            {displayList.length > 0 && virtualItems ? (
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
                  const item = displayList[virtualRow.index];
                  const key =
                    item.kind === 'entry'
                      ? `activity-${virtualRow.index}-${item.entry.id}`
                      : `group-${virtualRow.index}-${item.id}`;
                  return (
                    <div
                      key={key}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      className="absolute left-0 w-full"
                      style={{ top: virtualRow.start }}
                    >
                      {item.kind === 'entry' ? (
                        <ActivityBlock
                          entry={item.entry}
                          isStreaming={isStreaming}
                          activityId={item.activityId}
                          onActivityClick={onActivityClick}
                          lastStreamStartId={lastStreamStartId}
                          isInCurrentRun={currentRunIds.has(item.entry.id)}
                        />
                      ) : (
                        <CommandGroupBlock
                          entries={item.entries}
                          activityId={item.activityId}
                          onActivityClick={onActivityClick}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : displayList.length > 0 ? (
              displayList.map((item, index) =>
                item.kind === 'entry' ? (
                  <ActivityBlock
                    key={`activity-${index}-${item.entry.id}`}
                    entry={item.entry}
                    isStreaming={isStreaming}
                    activityId={item.activityId}
                    onActivityClick={onActivityClick}
                    lastStreamStartId={lastStreamStartId}
                    isInCurrentRun={currentRunIds.has(item.entry.id)}
                  />
                ) : (
                  <CommandGroupBlock
                    key={`group-${index}-${item.id}`}
                    entries={item.entries}
                    activityId={item.activityId}
                    onActivityClick={onActivityClick}
                  />
                )
              )
            ) : null}
            {(displayThinkingText || isStreaming) && (
              latestActivityId && onActivityClick ? (
                <button
                  type="button"
                  onClick={() => onActivityClick({ activityId: latestActivityId })}
                  className="w-full text-left cursor-pointer hover:ring-2 hover:ring-amber-500/30 rounded-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  <div
                    className={`${ACTIVITY_BLOCK_VARIANTS.reasoning} ${ACTIVITY_BLOCK_BASE} ${isStreaming ? 'animate-pulse' : ''} min-h-0 flex flex-col shrink-0`}
                    style={reasoningMaxHeightPx != null ? { maxHeight: reasoningMaxHeightPx } : undefined}
                  >
                    <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide shrink-0">
                      Response
                    </p>
                    <div className={`${ACTIVITY_MONO} flex-1 min-h-0 overflow-y-auto`}>
                      <ThinkingTextWithHighlights
                        text={displayThinkingText || (isStreaming ? '…' : '')}
                      />
                      <span
                        ref={thinkingScrollRef}
                        className="inline-block min-h-0"
                        aria-hidden
                      />
                    </div>
                  </div>
                </button>
              ) : (
                <div
                  className={`${ACTIVITY_BLOCK_VARIANTS.reasoning} ${ACTIVITY_BLOCK_BASE} ${isStreaming ? 'animate-pulse' : ''} min-h-0 flex flex-col shrink-0`}
                  style={reasoningMaxHeightPx != null ? { maxHeight: reasoningMaxHeightPx } : undefined}
                >
                  <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide shrink-0">
                    Response
                  </p>
                  <div className={`${ACTIVITY_MONO} flex-1 min-h-0 overflow-y-auto`}>
                    <ThinkingTextWithHighlights
                      text={displayThinkingText || (isStreaming ? '…' : '')}
                    />
                    <span
                      ref={thinkingScrollRef}
                      className="inline-block min-h-0"
                      aria-hidden
                    />
                  </div>
                </div>
              )
            )}
            {!isStreaming && filteredStoryItems.length > 0 && (
              <div
                className={`${ACTIVITY_BLOCK_VARIANTS.task_complete} px-3 py-1 flex items-center justify-between gap-2 min-w-0`}
              >
                <div className={`${FLEX_ROW_CENTER} min-w-0 flex-1 truncate`}>
                  <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                  <p className={`${ACTIVITY_LABEL} truncate`}>Task complete</p>
                </div>
                <span className={ACTIVITY_TIMESTAMP}>just now</span>
              </div>
            )}
            <div ref={activityEndRef} className="h-0 shrink-0" aria-hidden />
          </div>
        </div>
      )}

      {activityTooltip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`fixed z-[9999] rounded-lg px-4 py-3 text-sm font-medium bg-popover text-popover-foreground border border-border shadow-lg text-left leading-relaxed ${activityTooltip.variant === 'reasoning' ? 'min-w-[360px] max-w-[720px] whitespace-normal' : 'min-w-[320px] max-w-[560px] whitespace-pre-line'}`}
            role="tooltip"
            style={{
              left: activityTooltip.rect.left - 8,
              top: activityTooltip.rect.top + activityTooltip.rect.height / 2,
              transform: 'translate(-100%, -50%)',
            }}
          >
            {activityTooltip.content}
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
