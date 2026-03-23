import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useActivityReviewData } from './use-activity-review-data';

const { mockApiRequest, mockNavigate } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('./api-url', () => ({
  apiRequest: mockApiRequest,
}));

vi.mock('@shared/api-paths', () => ({
  API_PATHS: { ACTIVITIES: '/activities' },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const orig = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...orig,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('./use-persisted-type-filter', () => ({
  usePersistedTypeFilter: () => [[], vi.fn()],
}));

vi.mock('./agent-thinking-utils', () => ({
  filterVisibleStoryItems: (arr: unknown[]) => arr,
  getActivityLabel: (type: string) => type,
}));

vi.mock('./activity-review-utils', () => ({
  getCopyableActivityText: vi.fn().mockReturnValue('copied text'),
}));

const SAMPLE_ACTIVITY = {
  id: '11111111-1111-1111-1111-111111111111',
  created_at: new Date().toISOString(),
  story: [
    { id: 'story-1', type: 'tool_call', message: 'Ran bash', timestamp: new Date().toISOString() },
    { id: 'story-2', type: 'file_created', message: 'Created app.ts', timestamp: new Date().toISOString(), path: '/app.ts' },
  ],
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

// Flush all pending promises/microtasks using real timers
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useActivityReviewData', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockNavigate.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('starts with loading=true', () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    expect(result.current.loading).toBe(true);
  });

  it('loads activities successfully', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [SAMPLE_ACTIVITY] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activityStories.length).toBeGreaterThan(0);
    expect(result.current.loading).toBe(false);
  });

  it('sets error on failed fetch', async () => {
    mockApiRequest.mockRejectedValue(new Error('Network'));
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.error).toBe('Failed to load activities');
    expect(result.current.loading).toBe(false);
  });

  it('sets error when response is not ok', async () => {
    mockApiRequest.mockResolvedValue({ ok: false, text: async () => 'unauthorized' });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.error).toBe('unauthorized');
    expect(result.current.loading).toBe(false);
  });

  it('selectedStory is null when no stories', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.selectedStory).toBeNull();
  });

  it('exposes handleSelectStory to change selected index', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [SAMPLE_ACTIVITY] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();

    act(() => { result.current.handleSelectStory(0); });
    expect(result.current.selectedIndexSafe).toBe(0);
  });

  it('openSettings and closeSettings toggle settingsOpen', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();

    act(() => { result.current.setSettingsOpen(true); });
    expect(result.current.settingsOpen).toBe(true);
    act(() => { result.current.closeSettings(); });
    expect(result.current.settingsOpen).toBe(false);
  });

  it('runCopyActivityWithAnimation copies text to clipboard', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [SAMPLE_ACTIVITY] });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: writeTextMock } });

    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();

    await act(async () => { await result.current.runCopyActivityWithAnimation(); });
    expect(writeTextMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('uses fallback text for empty error response', async () => {
    mockApiRequest.mockResolvedValue({ ok: false, text: async () => '' });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.error).toBe('Failed to load activities');
  });

  it('detailSearchQuery state is exposed and settable', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();

    act(() => { result.current.setDetailSearchQuery('search term'); });
    expect(result.current.detailSearchQuery).toBe('search term');
  });

  it('filters stories by search query', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [SAMPLE_ACTIVITY] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();

    act(() => { result.current.setActivitySearchQuery('bash'); });
    const filtered = result.current.filteredStories;
    expect(filtered.every(s => s.message.toLowerCase().includes('bash'))).toBe(true);
  });

  it('resets selectedIndex when typeFilter changes', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [SAMPLE_ACTIVITY] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();

    act(() => { result.current.handleSelectStory(1); });
    act(() => { result.current.setTypeFilter(['tool_call']); });
    expect(result.current.selectedIndexSafe).toBe(0);
  });

  it('liveResponseText returns empty string when there are no activities', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.liveResponseText).toBe('');
  });

  it('liveResponseText returns empty when latest activity has no reasoning_start', async () => {
    const activity = {
      ...SAMPLE_ACTIVITY,
      story: [
        { id: 's1', type: 'tool_call', message: 'bash', timestamp: new Date().toISOString() },
      ],
    };
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [activity] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.liveResponseText).toBe('');
  });

  it('liveResponseText extracts the latest reasoning_start details from the activity', async () => {
    const activity = {
      ...SAMPLE_ACTIVITY,
      story: [
        { id: 's1', type: 'reasoning_start', message: '', timestamp: new Date().toISOString(), details: 'first thought' },
        { id: 's2', type: 'tool_call', message: 'bash', timestamp: new Date().toISOString() },
        { id: 's3', type: 'reasoning_start', message: '', timestamp: new Date().toISOString(), details: 'final thought' },
      ],
    };
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [activity] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.liveResponseText).toBe('final thought');
  });

  it('liveResponseText ignores reasoning_start with empty or "{}" details', async () => {
    const activity = {
      ...SAMPLE_ACTIVITY,
      story: [
        { id: 's1', type: 'reasoning_start', message: '', timestamp: new Date().toISOString(), details: '{}' },
        { id: 's2', type: 'reasoning_start', message: '', timestamp: new Date().toISOString(), details: '   ' },
      ],
    };
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [activity] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.liveResponseText).toBe('');
  });

  it('brainState starts as idle', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.brainState).toBe('idle');
  });

  it('brainState is idle for activities with old timestamps', async () => {
    const oldTs = new Date(Date.now() - 120_000).toISOString(); // 2 minutes ago
    const activity = {
      ...SAMPLE_ACTIVITY,
      story: [
        { id: 's1', type: 'tool_call', message: 'old run', timestamp: oldTs },
      ],
    };
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [activity] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    expect(result.current.brainState).toBe('idle');
  });

  it('brainState is complete (briefly) when first loading a recent activity', async () => {
    // Story entries with now-timestamps, loaded from idle → first load → complete
    const recentTs = new Date().toISOString();
    const activity = {
      ...SAMPLE_ACTIVITY,
      story: [
        { id: 's1', type: 'tool_call', message: 'recent', timestamp: recentTs },
      ],
    };
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [activity] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await flush();
    // First load of recent data: idle→complete
    expect(result.current.brainState).toBe('complete');
  });

  it('brainState transitions complete → idle after timeout', async () => {
    vi.useFakeTimers();
    const recentTs = new Date().toISOString();
    const activity = {
      ...SAMPLE_ACTIVITY,
      story: [
        { id: 's1', type: 'tool_call', message: 'recent', timestamp: recentTs },
      ],
    };
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => [activity] });
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });

    // Load initial data with real microtasks
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Should be complete after first load
    expect(result.current.brainState).toBe('complete');

    // Advance timer past BRAIN_COMPLETE_TO_IDLE_MS (7s)
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current.brainState).toBe('idle');
    vi.useRealTimers();
  });

  it('brainState goes working when new story entries arrive on a subsequent poll', async () => {
    const recentTs = new Date().toISOString();
    const initialActivity = {
      ...SAMPLE_ACTIVITY,
      story: [
        { id: 's1', type: 'tool_call', message: 'first', timestamp: recentTs },
      ],
    };
    const grownActivity = {
      ...SAMPLE_ACTIVITY,
      story: [
        { id: 's1', type: 'tool_call', message: 'first', timestamp: recentTs },
        { id: 's2', type: 'tool_call', message: 'second', timestamp: recentTs },
      ],
    };

    // Initial load = 1 entry; all polls after that return 2 entries
    mockApiRequest
      .mockResolvedValueOnce({ ok: true, json: async () => [initialActivity] })
      .mockResolvedValue({ ok: true, json: async () => [grownActivity] });

    vi.useFakeTimers();

    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });

    // Drain the initial fetch (microtasks only — no timer advancement yet)
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // After first load, brainState = complete (recent, prevLen was 0)
    expect(result.current.brainState).toBe('complete');

    // Advance ONLY the 7-second complete→idle timeout without triggering the poll interval.
    // The poll fires at 4s and 8s; to avoid it, we can't simply advance 7s.
    // Instead we check that the state machine correctly transitions to working
    // when setActivities is called with a grown payload while prevLen > 0.
    // We do this by: advancing 4s (first poll triggers with grownActivity).
    // At that point prevLen=1, currentLen=2, isRecent=true → working.
    // brainState is 'complete' (not 'working') when the poll arrives, so
    // the functional path is: isRecent=true, currentLen>prevLen, prevLen>0 → working.
    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Poll delivered 2 entries (up from 1) → brainState working
    expect(result.current.brainState).toBe('working');
    vi.useRealTimers();
  });

  it('isFollowing auto-scrolls to index 0 when new stories arrive', async () => {
    const ts = new Date().toISOString();
    const activity1 = {
      id: '11111111-1111-1111-1111-111111111111',
      created_at: ts,
      story: [{ id: 'x1', type: 'tool_call', message: 'A', timestamp: ts }],
    };
    const activity2 = {
      id: '22222222-2222-2222-2222-222222222222',
      created_at: ts,
      story: [
        { id: 'x1', type: 'tool_call', message: 'A', timestamp: ts },
        { id: 'x2', type: 'tool_call', message: 'B', timestamp: ts },
      ],
    };
    mockApiRequest
      .mockResolvedValueOnce({ ok: true, json: async () => [activity1] })
      .mockResolvedValue({ ok: true, json: async () => [activity2] });

    vi.useFakeTimers();
    const { result } = renderHook(() => useActivityReviewData({}), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Select story at index 1, enable follow
    act(() => { result.current.handleSelectStory(1); });
    act(() => { result.current.setIsFollowing(true); });

    // Trigger poll
    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Follow should have jumped back to 0
    expect(result.current.selectedIndexSafe).toBe(0);
    vi.useRealTimers();
  });
});
