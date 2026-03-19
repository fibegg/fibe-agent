import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from './api-url';
import { API_PATHS } from './api-paths';
import { filterVisibleStoryItems, getActivityLabel, type StoryEntry } from './agent-thinking-utils';
import { getCopyableActivityText } from './activity-review-utils';

const ACTIVITY_POLL_INTERVAL_MS = 4000;
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
  for (const a of activities) {
    if (!Array.isArray(a.story)) continue;
    for (const s of a.story) {
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
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [copyAnimating, setCopyAnimating] = useState(false);
  const [copyTooltipAnchor, setCopyTooltipAnchor] = useState<{ centerX: number; bottom: number } | null>(null);
  const brainButtonRef = useRef<HTMLDivElement>(null);
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [detailSearchQuery, setDetailSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activityStories = useMemo(() => flattenAllStories(activities), [activities]);

  const filteredStories = useMemo(() => {
    let list = activityStories;
    if (typeFilter === 'reasoning') list = list.filter((s) => s.type === 'reasoning_start' || s.type === 'reasoning_end');
    else if (typeFilter) list = list.filter((s) => s.type === typeFilter);
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
  };
}
