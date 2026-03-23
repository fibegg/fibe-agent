import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from './api-url';
import { API_PATHS } from '@shared/api-paths';
import { filterVisibleStoryItems, getActivityLabel, type StoryEntry } from './agent-thinking-utils';
import { getCopyableActivityText } from './activity-review-utils';
import { usePersistedTypeFilter } from './use-persisted-type-filter';

const ACTIVITY_POLL_INTERVAL_MS = 4000;
// How long to hold 'complete' (emerald) state before going back to idle — same as chat sidebar
const BRAIN_COMPLETE_TO_IDLE_MS = 7_000;
// If the most-recent story entry is older than this, treat the run as finished
const WORKING_RECENCY_MS = 90_000; // 90 seconds
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isActivityId(id: string): boolean {
  return UUID_REGEX.test(id);
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

type StoryEntryWithActivity = StoryEntry & { _activityId: string; _activityCreatedAt: string };

function flattenAllStories(activities: ActivityReviewData[]): StoryEntryWithActivity[] {
  const seen = new Set<string>();
  const out: StoryEntryWithActivity[] = [];
  for (let ai = activities.length - 1; ai >= 0; ai--) {
    const a = activities[ai];
    if (!Array.isArray(a.story)) continue;
    for (let si = a.story.length - 1; si >= 0; si--) {
      const s = a.story[si];
      if (!s?.id || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({
        ...s,
        timestamp: s.timestamp,
        _activityId: a.id,
        _activityCreatedAt: a.created_at,
      });
    }
  }
  return filterVisibleStoryItems(out) as StoryEntryWithActivity[];
}

export interface UseActivityReviewDataParams {
  activityId?: string;
  storyId?: string;
  activityStoryId?: string;
}

export function useActivityReviewData(params: UseActivityReviewDataParams) {
  const { activityId: routeActivityId, storyId: routeStoryId, activityStoryId } = params;
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [typeFilter, setTypeFilter] = usePersistedTypeFilter();
  const [copyAnimating, setCopyAnimating] = useState(false);
  const [copyTooltipAnchor, setCopyTooltipAnchor] = useState<{ centerX: number; bottom: number } | null>(null);
  const brainButtonRef = useRef<HTMLDivElement>(null);
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [detailSearchQuery, setDetailSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const prevFilteredLengthRef = useRef(0);
  // Brain state machine: idle | working | complete
  const [brainState, setBrainState] = useState<'idle' | 'working' | 'complete'>('idle');
  const brainStateRef = useRef<'idle' | 'working' | 'complete'>('idle');
  const completedAtRef = useRef<number>(0);
  const prevLatestStoryLenRef = useRef<number>(0);

  // Keep ref in sync so effects can read current brainState without it as a dependency
  useEffect(() => {
    brainStateRef.current = brainState;
  }, [brainState]);

  const activityStories = useMemo(() => flattenAllStories(activities), [activities]);

  // Extract the latest reasoning/response text from the most recent activity for the detail panel
  const liveResponseText = useMemo(() => {
    if (activities.length === 0) return '';
    const latest = activities[activities.length - 1];
    if (!Array.isArray(latest?.story) || latest.story.length === 0) return '';
    // Walk backwards to find the most recent reasoning_start with details
    for (let i = latest.story.length - 1; i >= 0; i--) {
      const s = latest.story[i];
      if (s?.type === 'reasoning_start' && s.details?.trim() && s.details.trim() !== '{}') {
        return s.details.trim();
      }
    }
    return '';
  }, [activities]);

  // Derive brain state from polling data
  useEffect(() => {
    const latest = activities[activities.length - 1];
    const story = Array.isArray(latest?.story) ? latest.story : [];

    if (story.length === 0) {
      prevLatestStoryLenRef.current = 0;
      setBrainState('idle');
      return;
    }

    const prevLen = prevLatestStoryLenRef.current;
    const currentLen = story.length;
    prevLatestStoryLenRef.current = currentLen;

    const lastEntry = story[story.length - 1];
    const lastTs = lastEntry?.timestamp ? new Date(lastEntry.timestamp).getTime() : 0;
    const isRecent = lastTs > 0 && Date.now() - lastTs < WORKING_RECENCY_MS;

    if (!isRecent) {
      setBrainState('idle');
      return;
    }

    // New entries just arrived → still working
    if (currentLen > prevLen && prevLen > 0) {
      setBrainState('working');
      completedAtRef.current = 0;
      return;
    }

    const prev = brainStateRef.current;

    if (prev === 'working') {
      // Growth stopped while working → transition to complete
      completedAtRef.current = Date.now();
      setBrainState('complete');
    } else if (prev === 'idle' && prevLen === 0) {
      // First load of a recent activity → briefly show complete
      completedAtRef.current = Date.now();
      setBrainState('complete');
    }
    // prev === 'complete' handled by the timeout below
  }, [activities]);

  // Timer: transition 'complete' → 'idle' after BRAIN_COMPLETE_TO_IDLE_MS
  useEffect(() => {
    if (brainState !== 'complete') return;
    const elapsed = Date.now() - completedAtRef.current;
    const remaining = Math.max(0, BRAIN_COMPLETE_TO_IDLE_MS - elapsed);
    if (remaining === 0) {
      setBrainState('idle');
      return;
    }
    const t = setTimeout(() => setBrainState('idle'), remaining);
    return () => clearTimeout(t);
  }, [brainState]);

  const filteredStories = useMemo(() => {
    let list = activityStories;
    if (typeFilter.length > 0) {
      const filterSet = new Set(typeFilter);
      // Expand 'reasoning' shorthand to include both start/end entries
      const hasReasoning = filterSet.has('reasoning');
      list = list.filter((s) => {
        if (hasReasoning && (s.type === 'reasoning_start' || s.type === 'reasoning_end')) return true;
        return filterSet.has(s.type);
      });
    }
    const q = activitySearchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => {
      const msg = (s.message ?? '').toLowerCase();
      const details = (s.details ?? '').toLowerCase();
      const cmd = (s.command ?? '').toLowerCase();
      const path = (s.path ?? '').toLowerCase();
      const label = (getActivityLabel(s.type) ?? '').toLowerCase();
      return msg.includes(q) || details.includes(q) || cmd.includes(q) || path.includes(q) || label.includes(q);
    });
  }, [activityStories, typeFilter, activitySearchQuery]);

  const selectedStory = useMemo(() => {
    if (filteredStories.length === 0) return null;
    const idx = Math.min(selectedIndex, filteredStories.length - 1);
    return filteredStories[idx];
  }, [filteredStories, selectedIndex]);

  const selectedIndexSafe = Math.min(selectedIndex, Math.max(0, filteredStories.length - 1));

  useEffect(() => {
    if (filteredStories.length === 0) return;
    if (routeActivityId && routeStoryId) {
      const idx = filteredStories.findIndex(
        (s) => (s as StoryEntryWithActivity)._activityId === routeActivityId && s.id === routeStoryId
      );
      if (idx !== -1) setSelectedIndex(idx);
      return;
    }
    const single = routeActivityId ?? routeStoryId ?? activityStoryId;
    if (!single) return;
    if (isActivityId(single)) {
      const idx = filteredStories.findIndex(
        (s) => (s as StoryEntryWithActivity)._activityId === single
      );
      if (idx !== -1) setSelectedIndex(idx);
      return;
    }
    const idx = filteredStories.findIndex((s) => s.id === single);
    if (idx !== -1) setSelectedIndex(idx);
  }, [routeActivityId, routeStoryId, activityStoryId, filteredStories]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [typeFilter]);

  // Auto-follow: when new stories arrive and isFollowing is on, jump to newest (index 0)
  useEffect(() => {
    if (!isFollowing) return;
    if (filteredStories.length === 0) return;
    if (filteredStories.length === prevFilteredLengthRef.current) return;
    prevFilteredLengthRef.current = filteredStories.length;
    setSelectedIndex(0);
  }, [isFollowing, filteredStories]);

  const handleSelectStory = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      const story = filteredStories[index] as StoryEntryWithActivity | undefined;
      if (!story?.id) return;
      const aid = story._activityId;
      if (aid) navigate(`/activity/${aid}/${story.id}`);
      else navigate(`/activity/${story.id}`);
    },
    [filteredStories, navigate]
  );

  const runCopyActivityWithAnimation = useCallback(async () => {
    if (!selectedStory || copyAnimating) return;
    const activity = activities.find((a) => a.id === (selectedStory as StoryEntryWithActivity)._activityId);
    const storyItems = activity?.story ?? [];
    setCopyAnimating(true);
    const text = getCopyableActivityText(storyItems);
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
  }, [selectedStory, activities, copyAnimating]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiRequest(API_PATHS.ACTIVITIES)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text();
          setError(text || 'Failed to load activities');
          setActivities([]);
          return;
        }
        const data = (await res.json()) as ActivityReviewData[];
        setActivities(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load activities');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const poll = () => {
      apiRequest(API_PATHS.ACTIVITIES)
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as ActivityReviewData[];
          setActivities(Array.isArray(data) ? data : []);
          setError(null);
        })
        .catch(() => undefined);
    };
    const interval = setInterval(poll, ACTIVITY_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loading]);

  return {
    activities,
    loading,
    error,
    activityStories,
    filteredStories,
    selectedStory,
    selectedIndexSafe,
    typeFilter,
    setTypeFilter,
    activitySearchQuery,
    setActivitySearchQuery,
    detailSearchQuery,
    setDetailSearchQuery,
    settingsOpen,
    setSettingsOpen,
    brainButtonRef,
    copyAnimating,
    copyTooltipAnchor,
    handleSelectStory,
    runCopyActivityWithAnimation,
    closeSettings,
    isFollowing,
    setIsFollowing,
    liveResponseText,
    brainState,
  };
}
