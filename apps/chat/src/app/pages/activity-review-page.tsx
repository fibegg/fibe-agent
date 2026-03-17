import { ArrowLeft, Brain, Loader2, Search, Settings, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../api-url';
import { API_PATHS } from '../api-paths';
import {
  getActivityIcon,
  getActivityLabel,
  getBlockVariant,
  type StoryEntry,
} from '../agent-thinking-utils';
import {
  parseThinkingSegmentsWithAgreement,
  SUSPICIOUS_TOOLTIP,
  AGREEMENT_TOOLTIP,
  UNCERTAINTY_TOOLTIP,
  QUESTION_TOOLTIP,
} from '../thinking-failure-patterns';
import { formatRelativeTime } from '../format-relative-time';
import { shouldHideThemeSwitch } from '../embed-config';
import {
  MAIN_CONTENT_MIN_WIDTH_PX,
  PANEL_HEADER_MIN_HEIGHT_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
} from '../layout-constants';
import { ThemeToggle } from '../theme-toggle';
import {
  ACTIVITY_BLOCK_BASE,
  ACTIVITY_BLOCK_VARIANTS,
  ACTIVITY_BODY,
  ACTIVITY_ICON_COLOR,
  ACTIVITY_LABEL,
  ACTIVITY_MONO,
  ACTIVITY_TIMESTAMP,
  BUTTON_ICON_ACCENT_SM,
  CLEAR_BUTTON_POSITION,
  FLEX_ROW_CENTER,
  FLEX_ROW_CENTER_WRAP,
  INPUT_SEARCH,
  MODAL_CARD,
  MODAL_OVERLAY_DARK,
  SEARCH_ICON_POSITION,
  SEARCH_ROW_WRAPPER,
  SETTINGS_CLOSE_BUTTON,
  SIDEBAR_HEADER,
  TREE_NODE_BASE,
  TREE_NODE_SELECTED,
} from '../ui-classes';

const ACTIVITY_POLL_INTERVAL_MS = 4000;
const SINGLE_ROW_TYPES = new Set(['stream_start', 'step', 'tool_call', 'file_created']);

const HIGHLIGHT_MARK_CLASS = 'bg-amber-400/40 text-amber-950 dark:bg-amber-400/50 dark:text-amber-100 rounded px-0.5';
const SUSPICIOUS_SEGMENT_CLASS =
  'bg-amber-500/25 text-amber-200 border-b border-amber-500/50 rounded-sm px-0.5';
const AGREEMENT_SEGMENT_CLASS =
  'bg-emerald-500/25 text-emerald-200 border-b border-emerald-500/50 rounded-sm px-0.5';
const UNCERTAINTY_SEGMENT_CLASS =
  'bg-amber-400/20 text-amber-100 border-b border-amber-400/40 rounded-sm px-0.5';
const QUESTION_SEGMENT_CLASS =
  'bg-sky-500/25 text-sky-200 border-b border-sky-500/50 rounded-sm px-0.5';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = escapeRegex(query.trim());
  const re = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className={HIGHLIGHT_MARK_CLASS}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function reasoningBodyWithHighlights(details: string, query: string): React.ReactNode {
  const segments = parseThinkingSegmentsWithAgreement(details);
  if (segments.length === 0) return details;
  return (
    <>
      {segments.map((seg, i) => {
        const inner = highlightText(seg.text, query);
        if (seg.kind === 'suspicious')
          return (
            <mark key={i} className={SUSPICIOUS_SEGMENT_CLASS} title={SUSPICIOUS_TOOLTIP}>
              {inner}
            </mark>
          );
        if (seg.kind === 'agreement')
          return (
            <mark key={i} className={AGREEMENT_SEGMENT_CLASS} title={AGREEMENT_TOOLTIP}>
              {inner}
            </mark>
          );
        if (seg.kind === 'uncertainty')
          return (
            <mark key={i} className={UNCERTAINTY_SEGMENT_CLASS} title={UNCERTAINTY_TOOLTIP}>
              {inner}
            </mark>
          );
        if (seg.kind === 'question')
          return (
            <mark key={i} className={QUESTION_SEGMENT_CLASS} title={QUESTION_TOOLTIP}>
              {inner}
            </mark>
          );
        return <span key={i}>{inner}</span>;
      })}
    </>
  );
}

const ACTIVITY_TYPE_FILTERS = [
  'reasoning',
  'stream_start',
  'step',
  'tool_call',
  'file_created',
  'task_complete',
] as const;

function getTypeFilterLabel(key: string | null): string {
  if (key === 'reasoning') return 'Reasoning';
  if (key === 'task_complete') return 'Complete';
  return (getActivityLabel(key ?? '') || key) ?? '';
}

const BADGE_ACTIVE_STYLES: Record<string, string> = {
  reasoning: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  stream_start: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  step: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
  tool_call: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  file_created: 'bg-green-500/20 text-green-300 border-green-500/40',
  task_complete: 'bg-green-500/20 text-green-300 border-green-500/40',
};
const BADGE_INACTIVE_STYLES: Record<string, string> = {
  reasoning: 'hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30',
  stream_start: 'hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30',
  step: 'hover:bg-zinc-500/10 hover:text-zinc-400 hover:border-zinc-500/30',
  tool_call: 'hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30',
  file_created: 'hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30',
  task_complete: 'hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30',
};

function commandLabel(entry: StoryEntry): string {
  if (entry.command) return entry.command;
  const raw = entry.message ?? entry.details ?? getActivityLabel(entry.type);
  return String(raw).replace(/^Ran\s+/i, '');
}

function getCopyableEntryText(entry: StoryEntry): string {
  const label = getActivityLabel(entry.type) ?? entry.type;
  const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
  const parts = [`${label}${time ? ` · ${time}` : ''}`];
  if (entry.message?.trim()) parts.push(entry.message.trim());
  if (entry.details?.trim() && String(entry.details).trim() !== '{}') parts.push(entry.details.trim());
  if (entry.type === 'tool_call' && entry.command) parts.push(`$ ${entry.command}`);
  if (entry.type === 'file_created' && entry.path) parts.push(entry.path);
  return parts.join('\n\n');
}

function getCopyableActivityText(story: StoryEntry[]): string {
  return story.map(getCopyableEntryText).join('\n\n---\n\n');
}

function ResponseListRow({
  entry,
  isSelected,
  onSelect,
}: {
  entry: StoryEntry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = getActivityIcon(entry.type);
  const label = getActivityLabel(entry.type);
  const iconColor = ACTIVITY_ICON_COLOR[entry.type] ?? ACTIVITY_ICON_COLOR.default;
  const summary =
    entry.type === 'file_created'
      ? entry.path ?? entry.details ?? entry.message
      : entry.type === 'tool_call'
        ? commandLabel(entry)
        : entry.type === 'reasoning_start' || entry.type === 'reasoning_end'
          ? (entry.details ?? '').trim().slice(0, 60) || 'Reasoning'
          : entry.message?.slice(0, 60) ?? label;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${TREE_NODE_BASE} ${isSelected ? TREE_NODE_SELECTED : ''}`}
    >
      <Icon className={`size-4 shrink-0 ${iconColor}`} />
      <span className="truncate text-left flex-1 min-w-0">{summary || label}</span>
      <span className={`${ACTIVITY_TIMESTAMP} shrink-0`}>{formatRelativeTime(entry.timestamp)}</span>
    </button>
  );
}

function ResponseDetail({ entry, highlightQuery }: { entry: StoryEntry; highlightQuery?: string }) {
  const Icon = getActivityIcon(entry.type);
  const label = getActivityLabel(entry.type);
  const variant = getBlockVariant(entry);
  const iconColor = ACTIVITY_ICON_COLOR[entry.type] ?? ACTIVITY_ICON_COLOR.default;
  const isSingleRow = SINGLE_ROW_TYPES.has(entry.type);
  const isThinkingBlock =
    entry.type === 'reasoning_start' && (entry.details ?? '').trim().length > 0;
  const q = highlightQuery ?? '';

  if (isSingleRow) {
    const singleRowText =
      entry.type === 'file_created'
        ? entry.path ?? entry.details ?? entry.message
        : entry.type === 'tool_call'
          ? commandLabel(entry)
          : entry.type === 'step'
            ? entry.message
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
        <span className={ACTIVITY_TIMESTAMP}>{formatRelativeTime(entry.timestamp)}</span>
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
        <span className={ACTIVITY_TIMESTAMP}>{formatRelativeTime(entry.timestamp)}</span>
      </div>
      {isThinkingBlock ? (
        <div className="mt-0.5 rounded-md bg-background/40 px-2 py-1.5 max-h-[70vh] overflow-y-auto">
          <p className={`text-[11px] ${ACTIVITY_MONO} whitespace-pre-wrap`}>
            {reasoningBodyWithHighlights(entry.details ?? '', q)}
          </p>
        </div>
      ) : (
        <div className="mt-0.5">
          {entry.message && (
            <p className={ACTIVITY_BODY}>{highlightText(entry.message, q)}</p>
          )}
          {entry.details &&
            entry.type !== 'reasoning_start' &&
            String(entry.details).trim() !== '{}' && (
              <p className="text-[10px] text-muted-foreground mt-0.5 break-words" title={entry.details}>
                {highlightText(entry.details, q)}
              </p>
            )}
          {entry.type === 'tool_call' && entry.command && (
            <pre className="mt-1 text-[11px] font-mono text-green-300/95 bg-background/40 rounded px-2 py-1 overflow-x-auto">
              $ {highlightText(entry.command, q)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export interface ActivityReviewData {
  id: string;
  created_at: string;
  story: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: string;
    details?: string;
    command?: string;
    path?: string;
  }>;
}

export function ActivityReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [activity, setActivity] = useState<ActivityReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [typeFilter, setTypeFilter] = useState<string | null>('reasoning');
  const [copyAnimating, setCopyAnimating] = useState(false);
  const [copyTooltipAnchor, setCopyTooltipAnchor] = useState<{ centerX: number; bottom: number } | null>(null);
  const brainButtonRef = useRef<HTMLDivElement>(null);
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [detailSearchQuery, setDetailSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const storyEntries = useMemo((): StoryEntry[] => {
    if (!activity?.story?.length) return [];
    return activity.story.map((s) => ({
      ...s,
      timestamp: s.timestamp,
    }));
  }, [activity]);

  const typeBadges = ACTIVITY_TYPE_FILTERS;

  const filteredEntries = useMemo(() => {
    let list = storyEntries;
    if (typeFilter === 'reasoning') list = list.filter((e) => e.type === 'reasoning_start' || e.type === 'reasoning_end');
    else if (typeFilter) list = list.filter((e) => e.type === typeFilter);
    const q = activitySearchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => {
      const msg = (e.message ?? '').toLowerCase();
      const details = (e.details ?? '').toLowerCase();
      const cmd = (e.command ?? '').toLowerCase();
      const path = (e.path ?? '').toLowerCase();
      const label = (getActivityLabel(e.type) ?? '').toLowerCase();
      return msg.includes(q) || details.includes(q) || cmd.includes(q) || path.includes(q) || label.includes(q);
    });
  }, [storyEntries, typeFilter, activitySearchQuery]);

  const selectedEntry = useMemo(() => {
    if (filteredEntries.length === 0) return null;
    const idx = Math.min(selectedIndex, filteredEntries.length - 1);
    return filteredEntries[idx];
  }, [filteredEntries, selectedIndex]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [typeFilter]);

  const handleSelectIndex = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const runCopyActivityWithAnimation = useCallback(async () => {
    if (!activity || copyAnimating) return;
    setCopyAnimating(true);
    const text = getCopyableActivityText(activity.story);
    try {
      await navigator.clipboard.writeText(text);
      const rect = brainButtonRef.current?.getBoundingClientRect();
      if (rect) {
        setCopyTooltipAnchor({ centerX: rect.left + rect.width / 2, bottom: rect.bottom });
      }
      setTimeout(() => {
        setCopyTooltipAnchor(null);
      }, 2500);
    } finally {
      setTimeout(() => setCopyAnimating(false), 2200);
    }
  }, [activity, copyAnimating]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Missing activity ID');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiRequest(`${API_PATHS.ACTIVITY}/${id}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text();
          setError(res.status === 404 ? 'Activity not found' : text || 'Failed to load activity');
          setActivity(null);
          return;
        }
        const data = (await res.json()) as ActivityReviewData;
        setActivity(data);
        setSelectedIndex(0);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load activity');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || loading) return;
    const poll = () => {
      apiRequest(`${API_PATHS.ACTIVITY}/${id}`)
        .then(async (res) => {
          if (!res.ok) {
            if (res.status === 404) return;
            setError(await res.text().catch(() => 'Failed to load activity'));
            return;
          }
          const data = (await res.json()) as ActivityReviewData;
          setActivity(data);
          setError(null);
        })
        .catch(() => {});
    };
    const interval = setInterval(poll, ACTIVITY_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-violet-950/10">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-violet-400" />
          <span className="text-sm text-muted-foreground">Loading activity…</span>
        </div>
      </div>
    );
  }

  if (error || !activity) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-violet-950/10">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <p className="text-sm text-destructive">{error ?? 'Activity not found'}</p>
          <Link
            to="/"
            className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-2"
          >
            <ArrowLeft className="size-4" />
            Back to chat
          </Link>
        </div>
      </div>
    );
  }

  const selectedIndexSafe = Math.min(selectedIndex, Math.max(0, filteredEntries.length - 1));

  return (
    <div className="flex h-screen w-full min-h-0 flex-col overflow-hidden bg-gradient-to-br from-background via-background to-violet-950/10">
      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
        <aside
          className="flex flex-col flex-shrink-0 bg-gradient-to-br from-background via-background to-purple-950/5 border-r border-violet-500/20 transition-all duration-300 overflow-hidden"
          style={{ width: RIGHT_SIDEBAR_WIDTH_PX, minWidth: 0 }}
        >
          <div
            className={`${SIDEBAR_HEADER} flex flex-col shrink-0 min-w-0`}
            style={{ minHeight: PANEL_HEADER_MIN_HEIGHT_PX }}
          >
            <div className="flex items-center gap-2 min-w-0 mb-2">
              <Link
                to="/"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground shrink-0 rounded-md p-1 -m-1 hover:bg-violet-500/10 transition-colors"
                aria-label="Back to chat"
              >
                <ArrowLeft className="size-4 shrink-0" />
                <span className="hidden sm:inline">Back</span>
              </Link>
              <div className="flex items-center gap-1 ml-auto shrink-0">
                <button
                  type="button"
                  className={BUTTON_ICON_ACCENT_SM}
                  title="Settings"
                  aria-label="Settings"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="size-3.5 sm:size-4" />
                </button>
                {!shouldHideThemeSwitch() && <ThemeToggle />}
              </div>
            </div>
            <div className={SEARCH_ROW_WRAPPER}>
              <Search className={SEARCH_ICON_POSITION} aria-hidden />
              <input
                type="text"
                value={activitySearchQuery}
                onChange={(e) => setActivitySearchQuery(e.target.value)}
                placeholder="Search activity..."
                className={INPUT_SEARCH}
                aria-label="Search activity list"
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
          </div>
          <div className="px-3 py-3 flex flex-wrap gap-2 shrink-0 border-b border-border/50">
            <button
              type="button"
              onClick={() => setTypeFilter(null)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors border ${typeFilter === null ? 'bg-violet-500/20 text-violet-300 border-violet-500/40' : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30'}`}
            >
              All
            </button>
            {typeBadges.map((filterKey) => {
              const label = getTypeFilterLabel(filterKey);
              const isActive = typeFilter === filterKey;
              const activeStyle = BADGE_ACTIVE_STYLES[filterKey] ?? 'bg-violet-500/20 text-violet-300 border-violet-500/40';
              const inactiveStyle = BADGE_INACTIVE_STYLES[filterKey] ?? 'hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30';
              return (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setTypeFilter(filterKey)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors border ${isActive ? activeStyle : `bg-muted/50 text-muted-foreground border-border/50 ${inactiveStyle}`}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5 min-h-0">
            {filteredEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4">
                {storyEntries.length === 0
                  ? 'No responses in this activity.'
                  : activitySearchQuery.trim()
                    ? 'No activity matches your search.'
                    : `No ${getTypeFilterLabel(typeFilter)} responses.`}
              </p>
            ) : (
              filteredEntries.map((entry, index) => (
                <ResponseListRow
                  key={entry.id}
                  entry={entry}
                  isSelected={index === selectedIndexSafe}
                  onSelect={() => handleSelectIndex(index)}
                />
              ))
            )}
          </div>
        </aside>
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
                  onClick={() => void runCopyActivityWithAnimation()}
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
                Activity · {new Date(activity.created_at).toLocaleString()}
              </h1>
            </div>
            <div className={SEARCH_ROW_WRAPPER}>
              <Search className={SEARCH_ICON_POSITION} aria-hidden />
              <input
                type="text"
                value={detailSearchQuery}
                onChange={(e) => setDetailSearchQuery(e.target.value)}
                placeholder="Search in response..."
                className={INPUT_SEARCH}
                aria-label="Search in response content"
              />
              {detailSearchQuery ? (
                <button
                  type="button"
                  onClick={() => setDetailSearchQuery('')}
                  className={CLEAR_BUTTON_POSITION}
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {selectedEntry ? (
              <div className="w-full min-w-0">
                <ResponseDetail entry={selectedEntry} highlightQuery={detailSearchQuery} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a response from the list.</p>
            )}
          </div>
        </main>
      </div>
      {settingsOpen && (
        <>
          <div className={MODAL_OVERLAY_DARK} aria-hidden onClick={closeSettings} />
          <div
            className={`fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 ${MODAL_CARD}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-settings-dialog-title"
          >
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <h2 id="activity-settings-dialog-title" className="text-lg font-semibold text-foreground">
                Settings
              </h2>
              <button
                type="button"
                onClick={closeSettings}
                className={SETTINGS_CLOSE_BUTTON}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {!shouldHideThemeSwitch() && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-foreground">Dark mode</span>
                  <ThemeToggle />
                </div>
              )}
              <p className="text-xs text-muted-foreground pt-2">
                v{__APP_VERSION__}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
