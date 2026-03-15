import {
  Brain,
  CheckCircle2,
  FileCode,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import { useRef, useEffect, useMemo, useState } from 'react';
import { SidebarToggle } from './sidebar-toggle';
import {
  RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
} from './layout-constants';
import { formatRelativeTime } from './format-relative-time';
import type { ThinkingStep } from './chat/thinking-types';
import { TypingText } from './chat/typing-text';
import {
  ACTIVITY_BLOCK_BASE,
  ACTIVITY_BLOCK_VARIANTS,
  ACTIVITY_BODY,
  ACTIVITY_ICON_COLOR,
  ACTIVITY_LABEL,
  ACTIVITY_MONO,
  ACTIVITY_TIMESTAMP,
  BADGE_CARD,
  CLEAR_BUTTON_POSITION,
  FLEX_ROW_CENTER,
  FLEX_ROW_CENTER_WRAP,
  INPUT_SEARCH,
  SEARCH_ICON_POSITION,
  SESSION_STATS_HEADING,
  SESSION_STATS_PANEL,
  SIDEBAR_HEADER,
  SIDEBAR_PANEL,
} from './ui-classes';

const DEFAULT_MODEL_LABEL = 'Model (default)';

export type StoryEntry = {
  id: string;
  type: string;
  message: string;
  timestamp: string | Date;
  details?: string;
  command?: string;
  path?: string;
};

export type SessionActivityEntry = {
  id: string;
  created_at: string;
  story: StoryEntry[];
};

function getActivityIcon(type: string) {
  switch (type) {
    case 'stream_start':
      return Sparkles;
    case 'reasoning_start':
    case 'reasoning_end':
      return Brain;
    case 'step':
      return Loader2;
    case 'file_created':
      return FileCode;
    case 'tool_call':
      return Terminal;
    case 'info':
      return MessageSquare;
    default:
      return MessageSquare;
  }
}

function getActivityLabel(type: string): string {
  switch (type) {
    case 'stream_start':
      return 'Started';
    case 'reasoning_start':
    case 'reasoning_end':
      return 'Reasoning';
    case 'step':
      return 'Step';
    case 'file_created':
      return 'File';
    case 'tool_call':
      return 'Command';
    case 'info':
      return 'Info';
    default:
      return 'Activity';
  }
}

function getBlockVariant(entry: StoryEntry): keyof typeof ACTIVITY_BLOCK_VARIANTS {
  if (entry.type === 'stream_start') return 'stream_start';
  if (entry.type === 'reasoning_start' || entry.type === 'reasoning_end') return 'reasoning';
  if (entry.type === 'step') return 'step';
  if (entry.type === 'tool_call') return 'tool_call';
  if (entry.type === 'file_created') return 'file_created';
  return 'default';
}

function formatSessionDurationMs(ms: number): string {
  if (ms < 1000) return '0s';
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / 60_000) % 60;
  const h = Math.floor(ms / 3_600_000);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (min > 0) parts.push(`${min}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

function toTimestampMs(ts: string | Date | undefined, fallback: string): number {
  if (!ts) return new Date(fallback).getTime();
  return typeof ts === 'string' ? new Date(ts).getTime() : (ts as Date).getTime();
}

interface AgentThinkingSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
  currentModel?: string;
  reasoningText?: string;
  streamingResponseText?: string;
  thinkingSteps?: ThinkingStep[];
  storyItems?: StoryEntry[];
  sessionActivity?: SessionActivityEntry[];
}

export function AgentThinkingSidebar({
  isCollapsed,
  onToggle,
  isStreaming = false,
  currentModel = '',
  reasoningText = '',
  streamingResponseText = '',
  thinkingSteps = [],
  storyItems = [],
  sessionActivity = [],
}: AgentThinkingSidebarProps) {
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const prevActivityDepsRef = useRef({
    storyLength: 0,
    sessionLength: 0,
    hasThinking: false,
    streaming: false,
  });
  const [activitySearchQuery, setActivitySearchQuery] = useState('');

  const displayThinkingText = reasoningText || streamingResponseText;

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

  const filteredStoryItems = activitySearchQuery.trim()
    ? storyItems.filter((entry) => {
        const q = activitySearchQuery.trim().toLowerCase();
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
      })
    : storyItems;

  useEffect(() => {
    if (isStreaming && displayThinkingText && typeof thinkingScrollRef.current?.scrollIntoView === 'function') {
      thinkingScrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isStreaming, displayThinkingText]);

  useEffect(() => {
    const prev = prevActivityDepsRef.current;
    const storyLength = storyItems.length;
    const sessionLength = sessionActivity.length;
    const hasThinking = !!displayThinkingText;
    const streaming = isStreaming;
    const activityGrew =
      storyLength > prev.storyLength ||
      sessionLength > prev.sessionLength ||
      (hasThinking && !prev.hasThinking) ||
      (streaming && !prev.streaming);
    prevActivityDepsRef.current = {
      storyLength,
      sessionLength,
      hasThinking,
      streaming,
    };
    if (activityGrew && typeof activityEndRef.current?.scrollIntoView === 'function') {
      activityEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [storyItems.length, sessionActivity.length, displayThinkingText, isStreaming]);

  const modelLabel = currentModel.trim() || DEFAULT_MODEL_LABEL;

  return (
    <div
      className={SIDEBAR_PANEL}
      style={{
        width: isCollapsed ? RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX : RIGHT_SIDEBAR_WIDTH_PX,
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

      <div className={SIDEBAR_HEADER}>
        {!isCollapsed ? (
          <>
            <div className={`${FLEX_ROW_CENTER_WRAP} mb-2 min-h-[3.25rem]`}>
              <div className={`${FLEX_ROW_CENTER} flex-1 overflow-hidden`}>
                <div className="relative shrink-0">
                  <Brain className="size-5 text-violet-400" />
                  <Sparkles className="size-3 text-violet-300 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm truncate">Agent Activity</h2>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {isStreaming ? 'Processing' : 'Idle'}
                  </p>
                </div>
              </div>
              <span className={BADGE_CARD} title={modelLabel}>
                {modelLabel}
              </span>
            </div>
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
        <div className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col gap-3">
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
            {filteredStoryItems.length === 0 && storyItems.length === 0 && !displayThinkingText && !isStreaming && (
              <p className="py-3 text-xs text-muted-foreground">
                Activity will appear here when the agent responds.
              </p>
            )}
            {filteredStoryItems.length === 0 && storyItems.length > 0 && activitySearchQuery.trim() && (
              <p className="py-3 text-xs text-muted-foreground">
                No activity matches &quot;{activitySearchQuery.trim()}&quot;.
              </p>
            )}
            {filteredStoryItems.map((entry) => {
                const Icon = getActivityIcon(entry.type);
                const label = getActivityLabel(entry.type);
                const variant = getBlockVariant(entry);
                const isCommandBlock = entry.type === 'tool_call' && entry.command;
                const isFileBlock = entry.type === 'file_created' && (entry.path || entry.details);
                const isThinkingBlock =
                  entry.type === 'reasoning_start' && (entry.details ?? '').trim().length > 0;
                const iconColor = ACTIVITY_ICON_COLOR[entry.type] ?? ACTIVITY_ICON_COLOR.default;
                return (
                  <div
                    key={entry.id}
                    className={`${ACTIVITY_BLOCK_VARIANTS[variant]} ${ACTIVITY_BLOCK_BASE}`}
                  >
                    <div className={FLEX_ROW_CENTER_WRAP}>
                      <div className={FLEX_ROW_CENTER}>
                        <Icon className={`size-4 shrink-0 ${iconColor}`} />
                        <p className={ACTIVITY_LABEL}>
                          {label}
                        </p>
                      </div>
                      <span className={ACTIVITY_TIMESTAMP}>
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </div>
                    {isThinkingBlock ? (
                      <div className="mt-0.5 rounded-md bg-background/40 px-2.5 py-2 max-h-32 overflow-y-auto">
                        <p className={`text-[11px] ${ACTIVITY_MONO}`}>
                          {entry.details}
                        </p>
                      </div>
                    ) : isCommandBlock ? (
                      <div className="mt-0.5 rounded-md bg-zinc-900/90 px-2.5 py-2 font-mono text-[11px] text-green-300/95 overflow-x-auto">
                        <span className="text-amber-400/80 select-none">$ </span>
                        <TypingText
                          text={entry.command ?? ''}
                          charMs={20}
                          showCursor={isStreaming}
                          skipAnimation={!isStreaming}
                        />
                      </div>
                    ) : isFileBlock ? (
                      <div className="mt-0.5 flex items-center gap-2 min-w-0">
                        <FileCode className="size-3.5 text-green-500 shrink-0" />
                        <span className="text-[11px] text-foreground/90 font-mono truncate" title={entry.path ?? entry.details}>
                          {entry.path ?? entry.details}
                        </span>
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
            })}
            {(displayThinkingText || isStreaming) && (
              <div
                className={`${ACTIVITY_BLOCK_VARIANTS.reasoning} ${ACTIVITY_BLOCK_BASE} ${isStreaming ? 'animate-pulse' : ''}`}
              >
                <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide">
                  {reasoningText ? 'Reasoning' : 'Response'}
                </p>
                <div className={ACTIVITY_MONO}>
                  {displayThinkingText || (isStreaming ? '…' : '')}
                  <span ref={thinkingScrollRef} className="inline-block min-h-0" aria-hidden />
                </div>
              </div>
            )}
            {!isStreaming && filteredStoryItems.length > 0 && (
              <div className={`${ACTIVITY_BLOCK_VARIANTS.task_complete} ${ACTIVITY_BLOCK_BASE}`}>
                <div className={FLEX_ROW_CENTER_WRAP}>
                  <div className={FLEX_ROW_CENTER}>
                    <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                    <p className={ACTIVITY_LABEL}>
                      Task complete
                    </p>
                  </div>
                  <span className={ACTIVITY_TIMESTAMP}>just now</span>
                </div>
                <p className={`${ACTIVITY_BODY} mt-0.5`}>
                  Response completed.
                </p>
              </div>
            )}
            <div ref={activityEndRef} className="h-0 shrink-0" aria-hidden />
          </div>

          <div className={SESSION_STATS_PANEL}>
            <h3 className={SESSION_STATS_HEADING}>
              <Zap className="size-3.5 shrink-0" aria-hidden />
              Session Stats
            </h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2 text-[11px]">
              <dt className="text-muted-foreground">Total actions:</dt>
              <dd className="font-medium text-foreground text-right">{sessionStats.totalActions}</dd>
              <dt className="text-muted-foreground">Completed:</dt>
              <dd className="font-medium text-emerald-400 text-right">{sessionStats.completed}</dd>
              <dt className="text-muted-foreground">Processing:</dt>
              <dd className="font-medium text-cyan-400 text-right">{sessionStats.processing}</dd>
              <dt className="text-muted-foreground">Session time:</dt>
              <dd className="font-medium text-foreground text-right">
                {formatSessionDurationMs(sessionStats.sessionTimeMs)}
              </dd>
            </dl>
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
