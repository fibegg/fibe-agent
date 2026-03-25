import { memo, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Terminal } from 'lucide-react';
import type { StoryEntry } from './agent-thinking-utils';
import {
  getActivityIcon,
  getActivityLabel,
  getBlockVariant,
} from './agent-thinking-utils';
import { TypingText } from './chat/typing-text';
import { formatRelativeTime } from './format-relative-time';
import {
  parseThinkingSegmentsWithAgreement,
  SUSPICIOUS_TOOLTIP,
  AGREEMENT_TOOLTIP,
  UNCERTAINTY_TOOLTIP,
  QUESTION_TOOLTIP,
} from './thinking-failure-patterns';
import {
  ACTIVITY_BLOCK_BASE,
  ACTIVITY_BLOCK_VARIANTS,
  ACTIVITY_BODY,
  ACTIVITY_ICON_COLOR,
  ACTIVITY_LABEL,
  ACTIVITY_MONO,
  ACTIVITY_TIMESTAMP,
  FLEX_ROW_CENTER,
  FLEX_ROW_CENTER_WRAP,
} from './ui-classes';

export type { StoryEntry } from './agent-thinking-utils';

export type SessionActivityEntry = {
  id: string;
  created_at: string;
  story: StoryEntry[];
};

const COMMAND_GROUP_MIN = 3;
export type StoryEntryWithActivityId = StoryEntry & { _activityId?: string };

export type DisplayItem =
  | { kind: 'entry'; entry: StoryEntry; activityId?: string }
  | { kind: 'command_group'; id: string; entries: StoryEntry[]; activityId?: string };

function clickTarget(entry: StoryEntryWithActivityId): string | undefined {
  return entry?._activityId ?? entry?.id;
}

export function buildDisplayList(entries: StoryEntryWithActivityId[]): DisplayItem[] {
  const result: DisplayItem[] = [];
  let i = 0;
  while (i < entries.length) {
    if (entries[i].type !== 'tool_call') {
      result.push({ kind: 'entry', entry: entries[i], activityId: clickTarget(entries[i]) });
      i++;
      continue;
    }
    let j = i;
    while (j < entries.length && entries[j].type === 'tool_call') j++;
    const runLength = j - i;
    const slice = entries.slice(i, j);
    const activityId = clickTarget(slice[0]!);
    if (runLength >= COMMAND_GROUP_MIN) {
      result.push({ kind: 'command_group', id: `cg-${entries[i].id}`, entries: slice, activityId });
      i = j;
    } else {
      for (let k = i; k < j; k++) result.push({ kind: 'entry', entry: entries[k], activityId: clickTarget(entries[k]) });
      i = j;
    }
  }
  return result;
}

export function commandLabel(entry: StoryEntry): string {
  if (entry.command) return entry.command;
  const raw = entry.message ?? entry.details ?? getActivityLabel(entry.type);
  return String(raw).replace(/^Ran\s+/i, '');
}

export function activityHoverContent(item: DisplayItem): string {
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

const SINGLE_ROW_TYPES = new Set(['stream_start', 'step', 'tool_call', 'file_created']);

const SUSPICIOUS_SEGMENT_CLASS =
  'bg-amber-500/25 text-amber-200 border-b border-amber-500/50 rounded-sm px-0.5';
const AGREEMENT_SEGMENT_CLASS =
  'bg-emerald-500/25 text-emerald-200 border-b border-emerald-500/50 rounded-sm px-0.5';
const UNCERTAINTY_SEGMENT_CLASS =
  'bg-amber-400/20 text-violet-100 border-b border-amber-400/40 rounded-sm px-0.5';
const QUESTION_SEGMENT_CLASS =
  'bg-sky-500/25 text-sky-200 border-b border-sky-500/50 rounded-sm px-0.5';

export const ThinkingTextWithHighlights = memo(function ThinkingTextWithHighlights({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const segments = useMemo(() => parseThinkingSegmentsWithAgreement(text), [text]);
  if (segments.length === 0) return null;
  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === 'suspicious')
          return (
            <mark key={i} className={SUSPICIOUS_SEGMENT_CLASS} title={SUSPICIOUS_TOOLTIP}>
              {seg.text}
            </mark>
          );
        if (seg.kind === 'agreement')
          return (
            <mark key={i} className={AGREEMENT_SEGMENT_CLASS} title={AGREEMENT_TOOLTIP}>
              {seg.text}
            </mark>
          );
        if (seg.kind === 'uncertainty')
          return (
            <mark key={i} className={UNCERTAINTY_SEGMENT_CLASS} title={UNCERTAINTY_TOOLTIP}>
              {seg.text}
            </mark>
          );
        if (seg.kind === 'question')
          return (
            <mark key={i} className={QUESTION_SEGMENT_CLASS} title={QUESTION_TOOLTIP}>
              {seg.text}
            </mark>
          );
        return <span key={i}>{seg.text}</span>;
      })}
    </span>
  );
});

export const ActivityBlock = memo(function ActivityBlock({
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
  onActivityClick?: (payload: { activityId: string; storyId?: string }) => void;
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
        onClick={() => onActivityClick({ activityId, storyId: entry.id })}
        className="w-full text-left cursor-pointer hover:ring-2 hover:ring-amber-500/30 rounded-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-amber-500/30"
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

export const CommandGroupBlock = memo(function CommandGroupBlock({
  entries,
  defaultExpanded = false,
  activityId,
  onActivityClick,
}: {
  entries: StoryEntry[];
  defaultExpanded?: boolean;
  activityId?: string;
  onActivityClick?: (payload: { activityId: string; storyId?: string }) => void;
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
  const firstEntryId = entries[0]?.id;
  return isClickable && activityId && onActivityClick ? (
    <button
      type="button"
      onClick={() => onActivityClick({ activityId, storyId: firstEntryId })}
      className="w-full text-left cursor-pointer hover:ring-2 hover:ring-amber-500/30 rounded-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-amber-500/30"
    >
      {content}
    </button>
  ) : (
    content
  );
});
