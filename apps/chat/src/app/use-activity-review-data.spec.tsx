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
});
