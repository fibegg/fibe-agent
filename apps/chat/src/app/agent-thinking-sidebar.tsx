import { useVirtualizer } from '@tanstack/react-virtual';
import { Brain, CheckCircle2, ChevronDown, ChevronRight, Loader2, Search, Sparkles, Terminal, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { memo, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { SidebarToggle } from './sidebar-toggle';
import {
  PANEL_HEADER_MIN_HEIGHT_PX,
  RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
} from './layout-constants';
import { formatRelativeTime } from './format-relative-time';
import type { ThinkingStep } from './chat/thinking-types';
import { TypingText } from './chat/typing-text';
import {
  filterVisibleStoryItems,
  getActivityIcon,
  getActivityLabel,
  getBlockVariant,
  toTimestampMs,
  type StoryEntry,
} from './agent-thinking-utils';
import {
  parseThinkingSegments,
  SUSPICIOUS_TOOLTIP,
} from './thinking-failure-patterns';
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
  HEADER_FIRST_ROW,
  SEARCH_ICON_POSITION,
  SEARCH_ROW_WRAPPER,
  SIDEBAR_HEADER,
  SIDEBAR_PANEL,
} from './ui-classes';

export type { StoryEntry } from './agent-thinking-utils';

export type SessionActivityEntry = {
  id: string;
  created_at: string;
  story: StoryEntry[];
};

const ACTIVITY_ESTIMATE_HEIGHT = 32;
const ACTIVITY_GAP = 8;
const ACTIVITY_VIRTUALIZE_THRESHOLD = 15;
const ACTIVITY_SCROLL_AT_BOTTOM_PX = 2;
const REASONING_MAX_HEIGHT_RATIO = 0.75;
const COMMAND_GROUP_MIN = 3;

const HIDDEN_WHEN_IDLE_TYPES = new Set(['stream_start', 'step']);

type StoryEntryWithActivityId = StoryEntry & { _activityId?: string };

export type DisplayItem =
  | { kind: 'entry'; entry: StoryEntry; activityId?: string }
  | { kind: 'command_group'; id: string; entries: StoryEntry[]; activityId?: string };

function buildDisplayList(entries: StoryEntryWithActivityId[]): DisplayItem[] {
  const result: DisplayItem[] = [];
  let i = 0;
  while (i < entries.length) {
    if (entries[i].type !== 'tool_call') {
      result.push({ kind: 'entry', entry: entries[i], activityId: entries[i]._activityId });
      i++;
      continue;
    }
    let j = i;
    while (j < entries.length && entries[j].type === 'tool_call') j++;
    const runLength = j - i;
    const slice = entries.slice(i, j);
    const activityId = slice[0]?._activityId;
    if (runLength >= COMMAND_GROUP_MIN) {
      result.push({ kind: 'command_group', id: `cg-${entries[i].id}`, entries: slice, activityId });
      i = j;
    } else {
      for (let k = i; k < j; k++) result.push({ kind: 'entry', entry: entries[k], activityId: entries[k]._activityId });
      i = j;
    }
  }
  return result;
}

function commandLabel(entry: StoryEntry): string {
  if (entry.command) return entry.command;
  const raw = entry.message ?? entry.details ?? getActivityLabel(entry.type);
  return String(raw).replace(/^Ran\s+/i, '');
}

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

function activityHoverContent(item: DisplayItem): string {
  if (item.kind === 'command_group') {
    const labels = item.entries.map((e) => commandLabel(e)).filter(Boolean);
    if (labels.length === 0) return 'Commands';
    return labels.map((l) => `$ ${l}`).join('\n');
  }
  const e = item.entry;
  if (e.type === 'tool_call') return `$ ${commandLabel(e) || 'Command'}`;
  if (e.type === 'file_created') return e.path ?? e.message ?? 'File';
  if (e.type === 'reasoning_start' || e.type === 'reasoning_end') return (e.details ?? '').trim() || 'Reasoning';
  if (e.type === 'stream_start') return 'Started';
  if (e.type === 'step') return e.message || e.details || 'Step';
  if (e.type === 'task_complete') return 'Task complete';
  return e.message || e.details || getActivityLabel(e.type);
}

const BRAIN_IDLE = 'text-violet-400';
const BRAIN_IDLE_ACCENT = 'text-violet-300';
const BRAIN_WORKING = 'text-blue-400';
const BRAIN_WORKING_ACCENT = 'text-blue-300';
const BRAIN_COMPLETE = 'text-emerald-400';
const BRAIN_COMPLETE_ACCENT = 'text-emerald-300';
const BRAIN_COMPLETE_TO_IDLE_MS = 7_000;

const SINGLE_ROW_TYPES = new Set(['stream_start', 'step', 'tool_call', 'file_created']);

const SUSPICIOUS_SEGMENT_CLASS =
  'bg-amber-500/25 text-amber-200 border-b border-amber-500/50 rounded-sm px-0.5';

const ThinkingTextWithHighlights = memo(function ThinkingTextWithHighlights({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const segments = useMemo(() => parseThinkingSegments(text), [text]);
  if (segments.length === 0) return null;
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.suspicious ? (
          <mark
            key={i}
            className={SUSPICIOUS_SEGMENT_CLASS}
            title={SUSPICIOUS_TOOLTIP}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  );
});

const ActivityBlock = memo(function ActivityBlock({
  entry,
  isStreaming,
  activityId,
  onActivityClick,
  lastStreamStartId,
  isInCurrentRun,
}: {
  entry: StoryEntry;
  isStreaming: boolean;
  activityId?: string;
  onActivityClick?: (activityId: string) => void;
  lastStreamStartId?: string | null;
  isInCurrentRun?: boolean;
}) {
  const Icon = getActivityIcon(entry.type);
  const label = getActivityLabel(entry.type);
  const variant = getBlockVariant(entry);
  const isCommandBlock = entry.type === 'tool_call' && entry.command;
  const isThinkingBlock =
    entry.type === 'reasoning_start' && (entry.details ?? '').trim().length > 0;
  const isSingleRow = SINGLE_ROW_TYPES.has(entry.type);
  const iconColor = ACTIVITY_ICON_COLOR[entry.type] ?? ACTIVITY_ICON_COLOR.default;
  const isClickable = !!(activityId && onActivityClick);
  const isStreamStartThinking =
    entry.type === 'stream_start' && isStreaming && entry.id === lastStreamStartId;
  const showTypingCursor = isStreaming && isInCurrentRun;

  const singleRowText =
    entry.type === 'file_created'
      ? (entry.path ?? entry.details ?? entry.message)
      : entry.type === 'tool_call'
        ? (entry.command ?? (entry.message ?? entry.details ?? label).replace(/^Ran\s+/i, ''))
        : entry.type === 'step'
          ? entry.message
          : label;

  const wrap = (node: React.ReactNode) =>
    isClickable && activityId && onActivityClick ? (
      <button
        type="button"
        onClick={() => onActivityClick(activityId)}
        className="w-full text-left cursor-pointer hover:ring-2 hover:ring-violet-500/30 rounded-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      >
        {node}
      </button>
    ) : (
      node
    );

  if (isSingleRow) {
    return wrap(
      <div
        className={`${ACTIVITY_BLOCK_VARIANTS[variant]} px-3 py-1 flex items-center justify-between gap-2 min-w-0`}
      >
        <div className={`${FLEX_ROW_CENTER} min-w-0 flex-1 truncate`}>
          {isStreamStartThinking ? (
            <Loader2 className={`size-4 shrink-0 animate-spin ${iconColor}`} />
          ) : (
            <Icon className={`size-4 shrink-0 ${iconColor}`} />
          )}
          {isCommandBlock ? (
            <span className="text-[11px] font-mono text-green-300/95 truncate" title={entry.details ?? entry.command}>
              <span className="text-amber-400/80 select-none">$ </span>
              <TypingText
                text={entry.command ?? ''}
                charMs={20}
                showCursor={showTypingCursor}
                skipAnimation={!showTypingCursor}
              />
            </span>
          ) : isStreamStartThinking ? (
            <p className={`${ACTIVITY_LABEL} truncate`} title="Thinking...">
              Thinking...
            </p>
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

  return wrap(
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
        <div className="mt-0.5 rounded-md bg-background/40 px-2 py-1.5 max-h-32 overflow-y-auto">
          <p className={`text-[11px] ${ACTIVITY_MONO}`}>
            <ThinkingTextWithHighlights text={entry.details ?? ''} />
          </p>
        </div>
      ) : (
        <div className="mt-0.5">
          <p className={ACTIVITY_BODY}>{entry.message}</p>
          {entry.details && entry.type !== 'reasoning_start' && String(entry.details).trim() !== '{}' && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={entry.details}>
              {entry.details}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

const COMMANDS_GROUP_STYLE = 'rounded-lg border border-amber-500/30 bg-amber-500/10';

const CommandGroupBlock = memo(function CommandGroupBlock({
  entries,
  defaultExpanded = false,
  activityId,
  onActivityClick,
}: {
  entries: StoryEntry[];
  defaultExpanded?: boolean;
  activityId?: string;
  onActivityClick?: (activityId: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const n = entries.length;
  const isClickable = !!(activityId && onActivityClick);
  const content = (
    <div className={`${COMMANDS_GROUP_STYLE} ${ACTIVITY_BLOCK_BASE} min-h-0 flex flex-col`}>
      <button
        type="button"
        onClick={(e) => {
          if (isClickable) e.stopPropagation();
          setExpanded((prev) => !prev);
        }}
        className={`${FLEX_ROW_CENTER_WRAP} w-full text-left gap-2 min-w-0 -m-1 p-1 rounded-md hover:bg-amber-500/10`}
        aria-expanded={expanded}
      >
        <div className={FLEX_ROW_CENTER}>
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-amber-500" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-amber-500" />
          )}
          <Terminal className="size-4 shrink-0 text-amber-500" />
          <p className={ACTIVITY_LABEL}>
            {n} command{n !== 1 ? 's' : ''}
          </p>
        </div>
        <span className={ACTIVITY_TIMESTAMP}>{formatRelativeTime(entries[0].timestamp)}</span>
      </button>
      {expanded && (
        <div className="mt-0.5 flex flex-col gap-0.5 max-h-40 overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 min-w-0 py-0.5 px-2 rounded bg-background/40 text-[11px] font-mono text-green-300/95 truncate"
              title={entry.details ?? entry.command}
            >
              <span className="text-amber-400/80 shrink-0 select-none">$</span>
              <span className="truncate">{commandLabel(entry)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  return isClickable && activityId && onActivityClick ? (
    <button
      type="button"
      onClick={() => onActivityClick(activityId)}
      className="w-full text-left cursor-pointer hover:ring-2 hover:ring-violet-500/30 rounded-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-violet-500/30"
    >
      {content}
    </button>
  ) : (
    content
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
  onActivityClick?: (activityId: string) => void;
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
  const prevStreamingRef = useRef(isStreaming);
  const completeSinceRef = useRef<number>(0);
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
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

  const fullStoryItems = useMemo((): StoryEntryWithActivityId[] => {
    const fromSession = sessionActivity.flatMap((a) =>
      (a.story ?? []).map((s) => ({ ...s, timestamp: s.timestamp, _activityId: a.id }))
    );
    const fromPast = pastActivityFromMessages.flatMap((a) =>
      (a.story ?? []).map((s) => ({ ...s, timestamp: s.timestamp }))
    );
    return filterVisibleStoryItems([...fromPast, ...fromSession, ...storyItems]) as StoryEntryWithActivityId[];
  }, [sessionActivity, pastActivityFromMessages, storyItems]);

  const sessionStats = useMemo(() => {
    const totalActions = fullStoryItems.length;
    const completed = isStreaming ? Math.max(0, totalActions - 1) : totalActions;
    const processing = isStreaming ? 1 : 0;
    const allEntries = fullStoryItems.map((s) => ({
      created_at: typeof s.timestamp === 'string' ? s.timestamp : (s.timestamp as Date)?.toISOString?.() ?? '',
      ts: s.timestamp,
    })).filter((e) => e.created_at || e.ts);
    const times = allEntries.map((e) => toTimestampMs(e.ts, e.created_at));
    const firstTs = times.length ? Math.min(...times) : 0;
    const lastTs = times.length ? Math.max(...times) : 0;
    const sessionTimeMs = lastTs && firstTs ? (isStreaming ? Date.now() - firstTs : lastTs - firstTs) : 0;
    return { totalActions, completed, processing, sessionTimeMs };
  }, [fullStoryItems, isStreaming]);

  const lastStoryTimestampMs = useMemo(() => {
    if (fullStoryItems.length === 0) return 0;
    const times = fullStoryItems.map((e) =>
      toTimestampMs(e.timestamp, typeof e.timestamp === 'string' ? e.timestamp : '')
    );
    return Math.max(...times);
  }, [fullStoryItems]);

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      completeSinceRef.current = Date.now();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const [transitionToIdleTrigger, setTransitionToIdleTrigger] = useState(0);
  useEffect(() => {
    if (isStreaming) return;
    const fromStory = fullStoryItems.length > 0 && lastStoryTimestampMs > 0 ? lastStoryTimestampMs : 0;
    const fromStreamEnd = completeSinceRef.current || 0;
    const completeAt = Math.max(fromStory, fromStreamEnd);
    if (completeAt === 0) return;
    const elapsed = Date.now() - completeAt;
    if (elapsed >= BRAIN_COMPLETE_TO_IDLE_MS) return;
    const remaining = BRAIN_COMPLETE_TO_IDLE_MS - elapsed;
    const t = setTimeout(() => setTransitionToIdleTrigger((n) => n + 1), remaining);
    return () => clearTimeout(t);
  }, [isStreaming, fullStoryItems.length, lastStoryTimestampMs, transitionToIdleTrigger]);

  const brainClasses = useMemo(() => {
    if (isStreaming) return { brain: BRAIN_WORKING, accent: BRAIN_WORKING_ACCENT };
    const fromStreamEnd = completeSinceRef.current;
    const fromStory =
      fullStoryItems.length > 0 && lastStoryTimestampMs > 0
        ? Date.now() - lastStoryTimestampMs < BRAIN_COMPLETE_TO_IDLE_MS
        : false;
    const fromStreamEndRecent =
      fromStreamEnd > 0 && Date.now() - fromStreamEnd < BRAIN_COMPLETE_TO_IDLE_MS;
    if (fromStory || fromStreamEndRecent) return { brain: BRAIN_COMPLETE, accent: BRAIN_COMPLETE_ACCENT };
    return { brain: BRAIN_IDLE, accent: BRAIN_IDLE_ACCENT };
  }, [isStreaming, fullStoryItems.length, lastStoryTimestampMs, transitionToIdleTrigger]);

  const filteredStoryItems = useMemo(() => {
    const forDisplay =
      isStreaming
        ? fullStoryItems
        : fullStoryItems.filter((e) => !HIDDEN_WHEN_IDLE_TYPES.has(e.type));
    if (!activitySearchQuery.trim()) return forDisplay;
    const q = activitySearchQuery.trim().toLowerCase();
    return forDisplay.filter((entry) => {
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
  }, [fullStoryItems, isStreaming, activitySearchQuery]);

  const { lastStreamStartId, currentRunIds } = useMemo(() => {
    let lastStreamStartIndex = -1;
    for (let i = filteredStoryItems.length - 1; i >= 0; i--) {
      if (filteredStoryItems[i].type === 'stream_start') {
        lastStreamStartIndex = i;
        break;
      }
    }
    const lastStreamStartId =
      lastStreamStartIndex >= 0 ? filteredStoryItems[lastStreamStartIndex].id : null;
    const currentRunIds = new Set(
      lastStreamStartIndex >= 0
        ? filteredStoryItems.slice(lastStreamStartIndex).map((e) => e.id)
        : []
    );
    return { lastStreamStartId, currentRunIds };
  }, [filteredStoryItems]);

  const displayList = useMemo(() => buildDisplayList(filteredStoryItems), [filteredStoryItems]);

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
          from { opacity: 0.6; transform: scale(1.06); }
          to { opacity: 1; transform: scale(1); }
        }
        .stat-tick { animation: statTick 0.22s ease-out 1; }
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
                    <span className="text-foreground stat-tick">{sessionStats.totalActions}</span>
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
                    <span className="text-emerald-400 stat-tick">{sessionStats.completed}</span>
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
                    <span className="text-cyan-400 stat-tick">{sessionStats.processing}</span>
                    <span className={STAT_TOOLTIP_POPOVER_CLASS} role="tooltip">
                      {STAT_TOOLTIPS.processing}
                    </span>
                  </span>
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
              <span className="text-foreground stat-tick" title={STAT_TOOLTIPS.total}>
                {sessionStats.totalActions}
              </span>
              <span className="text-emerald-400 stat-tick" title={STAT_TOOLTIPS.completed}>
                {sessionStats.completed}
              </span>
              <span className="text-cyan-400 stat-tick" title={STAT_TOOLTIPS.processing}>
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
                  onClick={() => onActivityClick(latestActivityId)}
                  className="w-full text-left cursor-pointer hover:ring-2 hover:ring-violet-500/30 rounded-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-violet-500/30"
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
