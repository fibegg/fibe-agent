import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThinkingSidebarData } from './use-thinking-sidebar-data';
import type { UseThinkingSidebarDataProps } from './use-thinking-sidebar-data';

vi.mock('./use-persisted-type-filter', () => ({
  usePersistedTypeFilter: vi.fn().mockReturnValue([[], vi.fn()]),
}));

vi.mock('./agent-thinking-utils', () => ({
  ensureUniqueStoryIds: vi.fn((items) => items),
  filterVisibleStoryItems: vi.fn((items) => items),
  getActivityLabel: vi.fn((type: string) => type),
  toTimestampMs: vi.fn((ts: unknown) => (ts instanceof Date ? ts.getTime() : Number(ts) || 0)),
}));

vi.mock('./agent-thinking-blocks', () => ({
  buildDisplayList: vi.fn((items) => items),
}));

const now = Date.now();

function makeStoryEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: `id-${Math.random()}`,
    type: 'tool_call',
    message: 'Test action',
    timestamp: new Date(now - 1000),
    ...overrides,
  };
}

function makeSessionActivity(story: ReturnType<typeof makeStoryEntry>[] = []) {
  return {
    id: `act-${Math.random()}`,
    type: 'tool_call',
    message: 'Activity',
    timestamp: new Date(now - 500),
    story,
  };
}

describe('useThinkingSidebarData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const baseProps: UseThinkingSidebarDataProps = {
    isStreaming: false,
    storyItems: [],
    sessionActivity: [],
    pastActivityFromMessages: [],
  };

  it('returns initial state with empty data', () => {
    const { result } = renderHook(() => useThinkingSidebarData(baseProps));
    expect(result.current.fullStoryItems).toEqual([]);
    expect(result.current.filteredStoryItems).toEqual([]);
    expect(result.current.sessionStats.totalActions).toBe(0);
    expect(result.current.activitySearchQuery).toBe('');
  });

  it('exposes setActivitySearchQuery', () => {
    const { result } = renderHook(() => useThinkingSidebarData(baseProps));
    act(() => {
      result.current.setActivitySearchQuery('test query');
    });
    expect(result.current.activitySearchQuery).toBe('test query');
  });

  it('computes sessionStats from storyItems', () => {
    const items = [makeStoryEntry(), makeStoryEntry()];
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, storyItems: items as never })
    );
    expect(result.current.sessionStats.totalActions).toBe(2);
    expect(result.current.sessionStats.processing).toBe(0);
    expect(result.current.sessionStats.completed).toBe(2);
  });

  it('marks 1 processing when streaming', () => {
    const items = [makeStoryEntry(), makeStoryEntry(), makeStoryEntry()];
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, isStreaming: true, storyItems: items as never })
    );
    expect(result.current.sessionStats.processing).toBe(1);
    expect(result.current.sessionStats.completed).toBe(2);
  });

  it('merges sessionActivity story items', () => {
    const story = [makeStoryEntry()];
    const activity = makeSessionActivity(story);
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, sessionActivity: [activity] as never })
    );
    expect(result.current.fullStoryItems.length).toBe(1);
  });

  it('merges pastActivityFromMessages story items', () => {
    const story = [makeStoryEntry()];
    const past = makeSessionActivity(story);
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, pastActivityFromMessages: [past] as never })
    );
    expect(result.current.fullStoryItems.length).toBe(1);
  });

  it('returns brain idle classes when not streaming and no recent activity', () => {
    const { result } = renderHook(() => useThinkingSidebarData(baseProps));
    expect(result.current.brainClasses.brain).toBe('text-violet-400');
    expect(result.current.brainClasses.accent).toBe('text-violet-300');
  });

  it('returns brain working classes when streaming', () => {
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, isStreaming: true })
    );
    expect(result.current.brainClasses.brain).toBe('text-cyan-400');
    expect(result.current.brainClasses.accent).toBe('text-cyan-300');
  });

  it('filters story items by search query on message', () => {
    const items = [
      makeStoryEntry({ message: 'apple action' }),
      makeStoryEntry({ message: 'banana action' }),
    ];
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, storyItems: items as never })
    );
    act(() => {
      result.current.setActivitySearchQuery('apple');
    });
    expect(result.current.filteredStoryItems.length).toBe(1);
    expect((result.current.filteredStoryItems[0] as { message: string }).message).toBe('apple action');
  });

  it('filters by details field', () => {
    const items = [
      makeStoryEntry({ message: 'action', details: 'specific detail' }),
      makeStoryEntry({ message: 'other action', details: 'nothing special' }),
    ];
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, storyItems: items as never })
    );
    act(() => {
      result.current.setActivitySearchQuery('specific');
    });
    expect(result.current.filteredStoryItems.length).toBe(1);
  });

  it('returns all items when search query is empty', () => {
    const items = [makeStoryEntry(), makeStoryEntry(), makeStoryEntry()];
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, storyItems: items as never })
    );
    expect(result.current.filteredStoryItems.length).toBe(3);
  });

  it('identifies lastStreamStartId correctly', () => {
    const items = [
      makeStoryEntry({ id: 'ss-1', type: 'stream_start' }),
      makeStoryEntry({ id: 'tc-1', type: 'tool_call' }),
    ];
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, isStreaming: true, storyItems: items as never })
    );
    expect(result.current.lastStreamStartId).toBe('ss-1');
  });

  it('currentRunIds includes items after stream_start', () => {
    const items = [
      makeStoryEntry({ id: 'ss-1', type: 'stream_start' }),
      makeStoryEntry({ id: 'tc-1', type: 'tool_call' }),
    ];
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, isStreaming: true, storyItems: items as never })
    );
    expect(result.current.currentRunIds.has('ss-1')).toBe(true);
    expect(result.current.currentRunIds.has('tc-1')).toBe(true);
  });

  it('hides stream_start and step types when idle', () => {
    const items = [
      makeStoryEntry({ id: 'ss-1', type: 'stream_start' }),
      makeStoryEntry({ id: 'tc-1', type: 'tool_call' }),
      makeStoryEntry({ id: 'st-1', type: 'step' }),
    ];
    const { result } = renderHook(() =>
      useThinkingSidebarData({ ...baseProps, isStreaming: false, storyItems: items as never })
    );
    const types = result.current.filteredStoryItems.map((e) => (e as { type: string }).type);
    expect(types).not.toContain('stream_start');
    expect(types).not.toContain('step');
  });
});
