import { Brain, Search, Sparkles, X } from 'lucide-react';
import { createPortal } from 'react-dom';
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
  getTypeFilterLabel,
  ACTIVITY_TYPE_FILTERS,
  BADGE_ACTIVE_STYLES,
  BADGE_INACTIVE_STYLES,
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

export interface ActivityTypeFiltersProps {
  typeFilter: string[];
  onTypeFilterChange: (filter: string[]) => void;
}

export function ActivityTypeFilters({ typeFilter, onTypeFilterChange }: ActivityTypeFiltersProps) {
  const isAllActive = typeFilter.length === 0;

  const toggleFilter = (key: string) => {
    if (typeFilter.includes(key)) {
      onTypeFilterChange(typeFilter.filter((f) => f !== key));
    } else {
      onTypeFilterChange([...typeFilter, key]);
    }
  };

  return (
    <div className="px-3 py-3 flex flex-wrap gap-2 shrink-0 border-b border-border/50">
      <button
        type="button"
        onClick={() => onTypeFilterChange([])}
        className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors border ${
          isAllActive
            ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
            : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30'
        }`}
      >
        All
      </button>
      {ACTIVITY_TYPE_FILTERS.map((filterKey) => {
        const label = getTypeFilterLabel(filterKey);
        const isActive = typeFilter.includes(filterKey);
        const activeStyle = BADGE_ACTIVE_STYLES[filterKey] ?? 'bg-violet-500/20 text-violet-300 border-violet-500/40';
        const inactiveStyle = BADGE_INACTIVE_STYLES[filterKey] ?? 'hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30';
        return (
          <button
            key={filterKey}
            type="button"
            onClick={() => toggleFilter(filterKey)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors border ${
              isActive ? activeStyle : `bg-muted/50 text-muted-foreground border-border/50 ${inactiveStyle}`
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export interface ActivityStoryListProps {
  stories: StoryEntry[];
  selectedIndex: number;
  onSelectStory: (index: number) => void;
  emptyMessage: string;
}

export function ActivityStoryList({
  stories,
  selectedIndex,
  onSelectStory,
  emptyMessage,
}: ActivityStoryListProps) {
  const safeIndex = Math.min(selectedIndex, Math.max(0, stories.length - 1));
  if (stories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-2 py-4">{emptyMessage}</p>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5 min-h-0">
      {stories.map((story, index) => (
        <StoryListRow
          key={story.id}
          story={story}
          isSelected={index === safeIndex}
          onSelect={() => onSelectStory(index)}
        />
      ))}
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
}

export function ActivityStoryDetailPanel({
  selectedStory,
  detailSearchQuery,
  onDetailSearchChange,
  copyAnimating,
  copyTooltipAnchor,
  brainButtonRef,
  onCopyClick,
}: ActivityStoryDetailPanelProps) {
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
                  <Brain className="size-8 text-violet-400 transition-colors" />
                  <Sparkles
                    className="size-5 text-violet-300 absolute -top-0.5 -right-0.5 animate-pulse transition-colors"
                    aria-hidden
                  />
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
          <h1 className="font-semibold text-sm text-foreground truncate min-w-0 flex-1 pl-3">
            {selectedStory
              ? `${getActivityLabel(selectedStory.type)} · ${formatRelativeTime(selectedStory.timestamp)}`
              : 'All activities'}
          </h1>
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
        {selectedStory ? (
          <div className="w-full min-w-0">
            <StoryDetail story={selectedStory} highlightQuery={detailSearchQuery} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a story from the list.</p>
        )}
      </div>
    </main>
  );
}
