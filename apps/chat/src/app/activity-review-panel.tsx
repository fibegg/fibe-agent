import { Brain, ChevronDown, ChevronRight, Loader2, Search, Sparkles, Terminal, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { CountUpNumber } from './count-up-number';
import {
  getActivityIcon,
  getActivityLabel,
  getBlockVariant,
  type StoryEntry,
} from './agent-thinking-utils';
import {
  highlightText,
  reasoningBodyWithHighlights,
  commandLabel,
  SINGLE_ROW_TYPES,
} from './activity-review-utils';
import { formatRelativeTime } from './format-relative-time';
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
  INPUT_SEARCH,
  SEARCH_ICON_POSITION,
  SEARCH_ROW_WRAPPER,
  CLEAR_BUTTON_POSITION,
  TREE_NODE_BASE,
  TREE_NODE_SELECTED,
} from './ui-classes';
import { MAIN_CONTENT_MIN_WIDTH_PX, PANEL_HEADER_MIN_HEIGHT_PX } from './layout-constants';

export function StoryListRow({
  story,
  isSelected,
  onSelect,
}: {
  story: StoryEntry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = getActivityIcon(story.type);
  const label = getActivityLabel(story.type);
  const iconColor = ACTIVITY_ICON_COLOR[story.type] ?? ACTIVITY_ICON_COLOR.default;
  const summary =
    story.type === 'file_created'
      ? story.path ?? (story.details?.trim() !== '{}' ? story.details : undefined) ?? story.message ?? label
      : story.type === 'tool_call'
        ? commandLabel(story)
        : story.type === 'reasoning_start' || story.type === 'reasoning_end'
          ? (story.details ?? '').trim().slice(0, 60) || 'Reasoning'
          : (story.message?.trim() !== '{}' ? story.message?.slice(0, 60) : undefined) ?? label;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${TREE_NODE_BASE} ${isSelected ? TREE_NODE_SELECTED : ''}`}
    >
      <Icon className={`size-4 shrink-0 ${iconColor}`} />
      <span className="truncate text-left flex-1 min-w-0">{summary || label}</span>
      <span className={`${ACTIVITY_TIMESTAMP} shrink-0`}>{formatRelativeTime(story.timestamp)}</span>
    </button>
  );
}

export function StoryDetail({
  story,
  highlightQuery,
}: {
  story: StoryEntry;
  highlightQuery?: string;
}) {
  const Icon = getActivityIcon(story.type);
  const label = getActivityLabel(story.type);
  const variant = getBlockVariant(story);
  const iconColor = ACTIVITY_ICON_COLOR[story.type] ?? ACTIVITY_ICON_COLOR.default;
  const isSingleRow = SINGLE_ROW_TYPES.has(story.type);
  const isThinkingBlock =
    story.type === 'reasoning_start' && (story.details ?? '').trim().length > 0;
  const q = highlightQuery ?? '';

  if (isSingleRow) {
    const singleRowText =
      story.type === 'file_created'
        ? story.path ?? story.details ?? story.message
        : story.type === 'tool_call'
          ? commandLabel(story)
          : story.type === 'step'
            ? story.message
            : label;
    return (
      <div
        className={`${ACTIVITY_BLOCK_VARIANTS[variant]} px-3 py-1.5 flex items-center justify-between gap-2 min-w-0`}
      >
        <div className={`${FLEX_ROW_CENTER} min-w-0 flex-1`}>
          <Icon className={`size-4 shrink-0 ${iconColor}`} />
          <p className={`${ACTIVITY_LABEL} truncate`} title={String(singleRowText)}>
            {highlightText(String(singleRowText), q)}
          </p>
        </div>
        <span className={ACTIVITY_TIMESTAMP}>{formatRelativeTime(story.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className={`${ACTIVITY_BLOCK_VARIANTS[variant]} ${ACTIVITY_BLOCK_BASE}`}>
      <div className={FLEX_ROW_CENTER_WRAP}>
        <div className={FLEX_ROW_CENTER}>
          <Icon className={`size-4 shrink-0 ${iconColor}`} />
          <p className={ACTIVITY_LABEL}>{label}</p>
        </div>
        <span className={ACTIVITY_TIMESTAMP}>{formatRelativeTime(story.timestamp)}</span>
      </div>
      {isThinkingBlock ? (
        <div className="mt-0.5 rounded-md bg-background/40 px-2 py-1.5 max-h-[70vh] overflow-y-auto">
          <p className={`text-[11px] ${ACTIVITY_MONO} whitespace-pre-wrap`}>
            {reasoningBodyWithHighlights(story.details ?? '', q)}
          </p>
        </div>
      ) : (
        <div className="mt-0.5">
          {story.message && (
            <p className={ACTIVITY_BODY}>{highlightText(story.message, q)}</p>
          )}
          {story.details &&
            story.type !== 'reasoning_start' &&
            String(story.details).trim() !== '{}' && (
              <p className="text-[10px] text-muted-foreground mt-0.5 break-words" title={story.details}>
                {highlightText(story.details, q)}
              </p>
            )}
          {story.type === 'tool_call' && story.command && (
            <pre className="mt-1 text-[11px] font-mono text-green-300/95 bg-background/40 rounded px-2 py-1 overflow-x-auto">
              $ {highlightText(story.command, q)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}



// ─── Command grouping (same as in AgentThinkingSidebar) ──────────────────────

const COMMAND_GROUP_MIN = 3;

type ActivityDisplayItem =
  | { kind: 'entry'; story: StoryEntry; originalIndex: number }
  | { kind: 'command_group'; id: string; entries: Array<{ story: StoryEntry; originalIndex: number }> };

function buildActivityDisplayList(stories: StoryEntry[]): ActivityDisplayItem[] {
  const result: ActivityDisplayItem[] = [];
  let i = 0;
  while (i < stories.length) {
    if (stories[i].type !== 'tool_call') {
      result.push({ kind: 'entry', story: stories[i], originalIndex: i });
      i++;
      continue;
    }
    let j = i;
    while (j < stories.length && stories[j].type === 'tool_call') j++;
    const runLength = j - i;
    if (runLength >= COMMAND_GROUP_MIN) {
      const startIndex = i;
      result.push({
        kind: 'command_group',
        id: `cg-${stories[i].id}`,
        entries: stories.slice(i, j).map((s, k) => ({ story: s, originalIndex: startIndex + k })),
      });
    } else {
      for (let k = i; k < j; k++) {
        result.push({ kind: 'entry', story: stories[k], originalIndex: k });
      }
    }
    i = j;
  }
  return result;
}

function CommandGroupListRow({
  entries,
  isAnySelected,
  onSelectFirst,
}: {
  entries: Array<{ story: StoryEntry; originalIndex: number }>;
  isAnySelected: boolean;
  onSelectFirst: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const n = entries.length;
  const first = entries[0];
  if (!first) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelectFirst();
          setExpanded((v) => !v);
        }}
        className={`${TREE_NODE_BASE} ${
          isAnySelected
            ? 'bg-violet-400/15 text-violet-300'
            : 'text-amber-400/80 hover:bg-violet-400/10 hover:text-violet-300'
        }`}
        aria-expanded={expanded}
      >
        {expanded
          ? <ChevronDown className="size-3.5 shrink-0 text-violet-500" />
          : <ChevronRight className="size-3.5 shrink-0 text-violet-500" />}
        <Terminal className="size-3.5 shrink-0 text-violet-500" />
        <span className="flex-1 truncate text-left text-xs">
          {n} command{n !== 1 ? 's' : ''}
        </span>
        <span className={`${ACTIVITY_TIMESTAMP} shrink-0`}>
          {formatRelativeTime(first.story.timestamp)}
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col mt-0.5 mb-0.5 ml-6 gap-px max-h-40 overflow-y-auto">
          {entries.map(({ story }) => (
            <button
              key={story.id}
              type="button"
              onClick={onSelectFirst}
              className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left min-w-0 hover:bg-violet-400/10 transition-colors"
            >
              <span className="text-amber-400/60 shrink-0 text-[10px] font-mono select-none">$</span>
              <span className="text-[11px] font-mono text-green-300/80 truncate">
                {commandLabel(story)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface ActivityStoryListProps {
  stories: StoryEntry[];
  selectedIndex: number;
  onSelectStory: (index: number) => void;
  emptyMessage: string;
  isFollowing?: boolean;
}

export function ActivityStoryList({
  stories,
  selectedIndex,
  onSelectStory,
  emptyMessage,
  isFollowing = false,
}: ActivityStoryListProps) {
  const safeIndex = Math.min(selectedIndex, Math.max(0, stories.length - 1));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll list to top (newest item) when following and story count changes
  useEffect(() => {
    if (!isFollowing || stories.length === 0) return;
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isFollowing, stories.length]);

  if (stories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-2 py-4">{emptyMessage}</p>
    );
  }
  const displayList = buildActivityDisplayList(stories);
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5 min-h-0">
      {displayList.map((item) => {
        if (item.kind === 'command_group') {
          const isAnySelected = item.entries.some((e) => e.originalIndex === safeIndex);
          return (
            <CommandGroupListRow
              key={item.id}
              entries={item.entries}
              isAnySelected={isAnySelected}
              onSelectFirst={() => onSelectStory(item.entries[0]?.originalIndex ?? 0)}
            />
          );
        }
        return (
          <StoryListRow
            key={item.story.id}
            story={item.story}
            isSelected={item.originalIndex === safeIndex}
            onSelect={() => onSelectStory(item.originalIndex)}
          />
        );
      })}
    </div>
  );
}

export interface ActivityStoryDetailPanelProps {
  selectedStory: StoryEntry | null;
  detailSearchQuery: string;
  onDetailSearchChange: (value: string) => void;
  copyAnimating: boolean;
  copyTooltipAnchor: { centerX: number; bottom: number } | null;
  brainButtonRef: React.RefObject<HTMLDivElement | null>;
  onCopyClick: () => void;
  liveResponseText?: string;
  brainState?: 'idle' | 'working' | 'complete';
  totalStories?: number;
  completedStories?: number;
  isFollowing?: boolean;
}

export function ActivityStoryDetailPanel({
  selectedStory,
  detailSearchQuery,
  onDetailSearchChange,
  copyAnimating,
  copyTooltipAnchor,
  brainButtonRef,
  onCopyClick,
  liveResponseText = '',
  brainState = 'idle',
  totalStories = 0,
  completedStories = 0,
  isFollowing = false,
}: ActivityStoryDetailPanelProps) {
  const isWorking = brainState === 'working';
  const isComplete = brainState === 'complete';
  const brainColor = isWorking ? 'text-cyan-400' : isComplete ? 'text-emerald-400' : 'text-violet-400';
  const accentColor = isWorking ? 'text-cyan-300' : isComplete ? 'text-emerald-300' : 'text-violet-300';
  const statColor = isWorking ? 'text-cyan-300' : isComplete ? 'text-emerald-400' : 'text-foreground';
  const liveResponseRef = useRef<HTMLDivElement>(null);

  // When following, scroll latest-response block into view whenever the text updates
  useEffect(() => {
    if (!isFollowing || !liveResponseText) return;
    liveResponseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isFollowing, liveResponseText]);
  return (
    <main
      className="flex-1 min-w-0 overflow-y-auto flex flex-col bg-transparent"
      style={{ minWidth: MAIN_CONTENT_MIN_WIDTH_PX }}
    >
      <div
        className="flex flex-col border-b border-border/50 shrink-0 min-w-0 px-4 py-3"
        style={{ minHeight: PANEL_HEADER_MIN_HEIGHT_PX }}
      >
        <style>{`
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
        <div className="flex items-center justify-between min-w-0 mb-2">
          <div ref={brainButtonRef} className="relative shrink-0 flex items-center justify-center">
            <button
              type="button"
              onClick={onCopyClick}
              disabled={copyAnimating}
              className="relative rounded-md hover:bg-muted/50 transition-colors cursor-pointer border-0 bg-transparent p-0"
              title="Copy activity to clipboard"
              aria-label="Copy activity to clipboard"
            >
              {copyAnimating ? (
                <span className="inline-flex items-center justify-center text-violet-400" aria-hidden>
                  <Brain className="size-8 brain-download-anim" />
                </span>
              ) : (
                <>
                  <Brain className={`size-8 transition-colors ${brainColor}`} />
                  {isWorking ? (
                    <Loader2
                      className={`size-5 ${accentColor} absolute -top-0.5 -right-0.5 animate-spin transition-colors`}
                      aria-hidden
                    />
                  ) : (
                    <Sparkles
                      className={`size-5 ${accentColor} absolute -top-0.5 -right-0.5 ${
                        isComplete ? '' : 'animate-pulse'
                      } transition-colors`}
                      aria-hidden
                    />
                  )}
                </>
              )}
            </button>
          </div>
          {copyTooltipAnchor &&
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
          <div className="flex flex-col min-w-0 flex-1 pl-3 gap-0.5">
            <h1 className="font-semibold text-sm text-foreground truncate min-w-0">
              {selectedStory
                ? `${getActivityLabel(selectedStory.type)} · ${formatRelativeTime(selectedStory.timestamp)}`
                : 'All activities'}
            </h1>
            {totalStories > 0 && (
              <p className="text-xs font-medium tabular-nums leading-none flex items-center gap-0.5 flex-wrap">
                <span className={`${statColor} transition-colors`}>
                  <CountUpNumber value={totalStories} format="raw" />
                </span>
                <span className="text-muted-foreground/60 text-[10px]"> total</span>
                <span className="text-muted-foreground/40 mx-0.5">·</span>
                <span className="text-emerald-400 transition-colors">
                  <CountUpNumber value={completedStories} format="raw" />
                </span>
                <span className="text-muted-foreground/60 text-[10px]"> done</span>
                {isWorking && (
                  <>
                    <span className="text-muted-foreground/40 mx-0.5">·</span>
                    <span className="text-cyan-400 text-[10px] animate-pulse">processing</span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <div className={SEARCH_ROW_WRAPPER}>
          <Search className={SEARCH_ICON_POSITION} aria-hidden />
          <input
            type="text"
            value={detailSearchQuery}
            onChange={(e) => onDetailSearchChange(e.target.value)}
            placeholder="Search in response..."
            className={INPUT_SEARCH}
            aria-label="Search in response content"
          />
          {detailSearchQuery ? (
            <button
              type="button"
              onClick={() => onDetailSearchChange('')}
              className={CLEAR_BUTTON_POSITION}
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {liveResponseText && (
          <div ref={liveResponseRef} className="mb-4 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2.5 flex flex-col gap-1.5 shadow-sm shadow-violet-500/10">
            <div className="flex items-center gap-2 shrink-0">
              <span className="relative flex size-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-violet-500" />
              </span>
              <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide">
                Latest Response
              </p>
            </div>
            <div className="max-h-[40vh] overflow-y-auto">
              <p className={`text-[11px] ${ACTIVITY_MONO} whitespace-pre-wrap`}>
                {reasoningBodyWithHighlights(liveResponseText, detailSearchQuery)}
              </p>
            </div>
          </div>
        )}
        {selectedStory ? (
          <div className="w-full min-w-0">
            <StoryDetail story={selectedStory} highlightQuery={detailSearchQuery} />
          </div>
        ) : (
          !liveResponseText && <p className="text-sm text-muted-foreground">Select a story from the list.</p>
        )}
      </div>
    </main>
  );
}
