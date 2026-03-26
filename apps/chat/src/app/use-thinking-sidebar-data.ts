import { useMemo, useState, useEffect, useRef } from 'react';
import { usePersistedTypeFilter } from './use-persisted-type-filter';
import {
  ensureUniqueStoryIds,
  filterVisibleStoryItems,
  getActivityLabel,
  toTimestampMs,
} from './agent-thinking-utils';
import { buildDisplayList } from './agent-thinking-blocks';
import type { StoryEntry, SessionActivityEntry, StoryEntryWithActivityId } from './agent-thinking-blocks';

const HIDDEN_WHEN_IDLE_TYPES = new Set(['stream_start', 'step']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BRAIN_IDLE = 'text-violet-400';
const BRAIN_IDLE_ACCENT = 'text-violet-300';
const BRAIN_WORKING = 'text-cyan-400';
const BRAIN_WORKING_ACCENT = 'text-cyan-300';
const BRAIN_COMPLETE = 'text-emerald-400';
const BRAIN_COMPLETE_ACCENT = 'text-emerald-300';
const BRAIN_COMPLETE_TO_IDLE_MS = 7_000;

export interface UseThinkingSidebarDataProps {
  isStreaming: boolean;
  storyItems: StoryEntry[];
  sessionActivity: SessionActivityEntry[];
  pastActivityFromMessages: SessionActivityEntry[];
}

export function useThinkingSidebarData({
  isStreaming,
  storyItems,
  sessionActivity,
  pastActivityFromMessages,
}: UseThinkingSidebarDataProps) {
  const [persistedTypeFilter] = usePersistedTypeFilter();
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  
  const prevStreamingRef = useRef(isStreaming);
  const completeSinceRef = useRef<number>(0);
  const [transitionToIdleTrigger, setTransitionToIdleTrigger] = useState(0);

  const fullStoryItems = useMemo((): StoryEntryWithActivityId[] => {
    const fromSession = sessionActivity.flatMap((a) =>
      (a.story ?? []).map((s) => ({ ...s, timestamp: s.timestamp, _activityId: a.id }))
    );
    const fromPast = pastActivityFromMessages.flatMap((a) =>
      (a.story ?? []).map((s) => ({
        ...s,
        timestamp: s.timestamp,
        _activityId: a.id && UUID_REGEX.test(a.id) ? a.id : undefined,
      }))
    );
    const combined = filterVisibleStoryItems([...fromPast, ...fromSession, ...storyItems]) as StoryEntryWithActivityId[];
    return ensureUniqueStoryIds(combined);
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
  }, [isStreaming, fullStoryItems.length, lastStoryTimestampMs]);

  const filteredStoryItems = useMemo(() => {
    let forDisplay =
      isStreaming
        ? fullStoryItems
        : fullStoryItems.filter((e) => !HIDDEN_WHEN_IDLE_TYPES.has(e.type));
    if (persistedTypeFilter.length > 0) {
      const filterSet = new Set(persistedTypeFilter);
      const hasReasoning = filterSet.has('reasoning');
      forDisplay = forDisplay.filter((s) => {
        if (hasReasoning && (s.type === 'reasoning_start' || s.type === 'reasoning_end')) return true;
        return filterSet.has(s.type);
      });
    }
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
  }, [fullStoryItems, isStreaming, activitySearchQuery, persistedTypeFilter]);

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

  return {
    activitySearchQuery,
    setActivitySearchQuery,
    fullStoryItems,
    filteredStoryItems,
    sessionStats,
    brainClasses,
    lastStreamStartId,
    currentRunIds,
    displayList
  };
}
