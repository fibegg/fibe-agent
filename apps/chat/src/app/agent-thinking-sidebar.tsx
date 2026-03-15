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

const BLOCK_VARIANTS = {
  stream_start: 'rounded-lg border border-blue-500/30 bg-blue-500/10',
  reasoning: 'rounded-lg border border-violet-500/30 bg-violet-500/10',
  step: 'rounded-lg border border-zinc-500/20 bg-zinc-500/10',
  tool_call: 'rounded-lg border border-amber-500/30 bg-amber-500/10',
  file_created: 'rounded-lg border border-green-500/30 bg-green-500/10',
  task_complete: 'rounded-lg border border-green-500/30 bg-green-500/10',
  default: 'rounded-lg border border-violet-500/20 bg-violet-500/5',
} as const;

function getBlockVariant(entry: StoryEntry): keyof typeof BLOCK_VARIANTS {
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
    if (typeof activityEndRef.current?.scrollIntoView === 'function') {
      activityEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [storyItems.length, sessionActivity.length, displayThinkingText, isStreaming]);

  const modelLabel = currentModel.trim() || DEFAULT_MODEL_LABEL;

  return (
    <div
      className="relative h-full flex flex-col flex-shrink-0 bg-gradient-to-br from-background via-background to-purple-950/5 border-l border-violet-500/20 transition-all duration-300"
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

      <div className="p-4 border-b border-violet-500/20 shrink-0">
        {!isCollapsed ? (
          <>
            <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
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
              <span
                className="shrink-0 text-xs bg-card/50 backdrop-blur-sm border border-border/50 h-auto py-1 px-2 rounded-md truncate max-w-[120px]"
                title={modelLabel}
              >
                {modelLabel}
              </span>
            </div>
            <div className="relative h-8 mt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={activitySearchQuery}
                onChange={(e) => setActivitySearchQuery(e.target.value)}
                placeholder="Search activity..."
                className="w-full h-8 pl-8 pr-8 text-xs bg-input-background border border-violet-500/30 rounded-md focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 text-foreground placeholder:text-muted-foreground"
                aria-label="Search activity"
              />
              {activitySearchQuery ? (
                <button
                  type="button"
                  onClick={() => setActivitySearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                const iconColor =
                  entry.type === 'file_created'
                    ? 'text-green-500'
                    : entry.type === 'tool_call'
                      ? 'text-amber-500'
                      : entry.type === 'stream_start'
                        ? 'text-blue-400'
                        : 'text-violet-400';
                return (
                  <div
                    key={entry.id}
                    className={`${BLOCK_VARIANTS[variant]} px-3 py-2.5 flex flex-col gap-1.5`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`size-4 shrink-0 ${iconColor}`} />
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/90 truncate">
                          {label}
                        </p>
                      </div>
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </div>
                    {isThinkingBlock ? (
                      <div className="mt-0.5 rounded-md bg-background/40 px-2.5 py-2 max-h-32 overflow-y-auto">
                        <p className="text-[11px] text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed break-words">
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
                        <p className="text-xs text-foreground/90 break-words">{entry.message}</p>
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
                className={`${BLOCK_VARIANTS.reasoning} px-3 py-2.5 flex flex-col gap-1.5 ${isStreaming ? 'animate-pulse' : ''}`}
              >
                <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide">
                  {reasoningText ? 'Reasoning' : 'Response'}
                </p>
                <div className="text-xs text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed break-words">
                  {displayThinkingText || (isStreaming ? '…' : '')}
                  <span ref={thinkingScrollRef} className="inline-block min-h-0" aria-hidden />
                </div>
              </div>
            )}
            {!isStreaming && filteredStoryItems.length > 0 && (
              <div className={`${BLOCK_VARIANTS.task_complete} px-3 py-2.5 flex flex-col gap-1.5`}>
                <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/90 truncate">
                      Task complete
                    </p>
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0">just now</span>
                </div>
                <p className="text-xs text-foreground/90 mt-0.5 break-words">
                  Response completed.
                </p>
              </div>
            )}
            <div ref={activityEndRef} className="h-0 shrink-0" aria-hidden />
          </div>

          <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 overflow-hidden shrink-0">
            <h3 className="text-xs font-semibold px-3 py-2 text-violet-300 border-b border-violet-500/20">
              Session stats
            </h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2 text-[11px]">
              <dt className="text-muted-foreground">Total actions</dt>
              <dd className="font-medium text-foreground text-right">{sessionStats.totalActions}</dd>
              <dt className="text-muted-foreground">Completed</dt>
              <dd className="font-medium text-foreground text-right">{sessionStats.completed}</dd>
              <dt className="text-muted-foreground">Processing</dt>
              <dd className="font-medium text-foreground text-right">{sessionStats.processing}</dd>
              <dt className="text-muted-foreground">Session time</dt>
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
