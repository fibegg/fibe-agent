import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePlaygroundFiles } from './use-playground-files';

vi.mock('../api-url', () => ({
  apiRequest: vi.fn((path: string, options?: RequestInit) => fetch(path, options)),
}));

describe('usePlaygroundFiles', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns entries, tree, loading, error, and refetch', () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<Response>(() => undefined)
    );
    const { result } = renderHook(() => usePlaygroundFiles());
    expect(Array.isArray(result.current.entries)).toBe(true);
    expect(Array.isArray(result.current.tree)).toBe(true);
    expect(typeof result.current.loading).toBe('boolean');
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refetch).toBe('function');
  });

  it('fetches on mount and sets entries when API returns data', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('stats')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ fileCount: 2, totalLines: 10 }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [
          { name: 'a', path: 'a', type: 'file' },
          { name: 'b', path: 'b', type: 'directory', children: [] },
        ],
      });
    });
    const { result } = renderHook(() => usePlaygroundFiles());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('sets error when fetch fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => usePlaygroundFiles());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.error).toBe('Network error');
  });

  it('refetch updates entries when called', async () => {
    let callCount = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('stats')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ fileCount: 0, totalLines: 0 }) });
      }
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [{ name: 'new', path: 'new', type: 'file' }],
      });
    });
    const { result } = renderHook(() => usePlaygroundFiles());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.entries).toHaveLength(0);
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].name).toBe('new');
  });

  it('refetches when document becomes visible', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('stats')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ fileCount: 0, totalLines: 0 }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    const { result } = renderHook(() => usePlaygroundFiles());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const callCountAfterMount = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => {
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callCountAfterMount);
    });
  });
});
