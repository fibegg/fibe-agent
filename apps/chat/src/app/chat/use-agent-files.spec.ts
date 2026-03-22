import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentFiles } from './use-agent-files';

const { mockApiRequest } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
}));

vi.mock('../api-url', () => ({
  apiRequest: mockApiRequest,
}));

vi.mock('@shared/api-paths', () => ({
  API_PATHS: { AGENT_FILES: '/agent/files', AGENT_FILES_STATS: '/agent/files/stats' },
}));

vi.mock('../layout-constants', () => ({
  REFETCH_WHEN_EMPTY_MS: 500,
  getInitialSidebarCollapsed: () => false,
  getInitialRightSidebarCollapsed: () => false,
  persistSidebarCollapsed: vi.fn(),
  persistRightSidebarCollapsed: vi.fn(),
}));

// Helper: flush all pending microtasks by awaiting multiple promise resolutions
async function flushAll() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAgentFiles', () => {
  beforeEach(() => {
    // Use real timers to avoid deadlock with waitFor + fake timers
    mockApiRequest.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts with loading=true and empty tree', () => {
    mockApiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    const { result } = renderHook(() => useAgentFiles());
    expect(result.current.loading).toBe(true);
    expect(result.current.tree).toEqual([]);
  });

  it('loads tree data from API', async () => {
    const fakeTree = [{ name: 'file.ts', path: 'file.ts', type: 'file' as const }];
    mockApiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => fakeTree });

    const { result } = renderHook(() => useAgentFiles());
    await flushAll();

    expect(result.current.tree).toEqual(fakeTree);
    expect(result.current.hasFiles).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('returns hasFiles=false when tree is empty', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => [] });

    const { result } = renderHook(() => useAgentFiles());
    await flushAll();

    expect(result.current.hasFiles).toBe(false);
  });

  it('clears tree on 401 response', async () => {
    mockApiRequest.mockResolvedValue({ ok: false, status: 401 });

    const { result } = renderHook(() => useAgentFiles());
    await flushAll();

    expect(result.current.tree).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets error and clears tree on network failure', async () => {
    mockApiRequest.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAgentFiles());
    await flushAll();

    expect(result.current.error).toBe('Network error');
    expect(result.current.tree).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets error message for non-Error throws', async () => {
    mockApiRequest.mockRejectedValue('string error');

    const { result } = renderHook(() => useAgentFiles());
    await flushAll();

    expect(result.current.error).toBe('Failed to load');
  });

  it('sets error on non-ok non-401 response', async () => {
    mockApiRequest.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useAgentFiles());
    await flushAll();

    expect(result.current.error).toBeTruthy();
  });

  it('fetchStats updates stats when API returns ok', async () => {
    const fakeTree = [{ name: 'a.ts', path: 'a.ts', type: 'file' as const }];
    mockApiRequest
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => fakeTree })
      .mockResolvedValue({ ok: true, json: async () => ({ fileCount: 5, totalLines: 100 }) });

    const { result } = renderHook(() => useAgentFiles());
    await flushAll();

    expect(result.current.stats.fileCount).toBe(5);
  });

  it('handles stats fetch failure gracefully', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockRejectedValue(new Error('Stats failed'));

    const { result } = renderHook(() => useAgentFiles());
    await flushAll();

    // Stats should remain at default
    expect(result.current.stats.fileCount).toBe(0);
  });

  it('exposes a refetch function', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => [] });

    const { result } = renderHook(() => useAgentFiles());
    await flushAll();

    expect(typeof result.current.refetch).toBe('function');
  });

  it('refetches on visibilitychange when visible', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => [] });

    renderHook(() => useAgentFiles());
    await flushAll();

    const callsBefore = mockApiRequest.mock.calls.length;

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await flushAll();

    expect(mockApiRequest.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
