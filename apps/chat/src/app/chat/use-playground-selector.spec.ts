import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlaygroundSelector } from './use-playground-selector';

// Mock apiRequest
const mockApiRequest = vi.fn();
vi.mock('../api-url', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

describe('usePlaygroundSelector', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
  });

  it('initializes with empty state', () => {
    const { result } = renderHook(() => usePlaygroundSelector());
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.currentLink).toBeNull();
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.breadcrumbs).toEqual([]);
  });

  it('open() fetches root entries and current link', async () => {
    const mockEntries = [
      { name: 'project', path: 'project', type: 'directory' },
    ];
    mockApiRequest
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEntries) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ current: 'some/link' }) });

    const { result } = renderHook(() => usePlaygroundSelector());

    await act(async () => {
      result.current.open();
    });

    expect(result.current.entries).toEqual(mockEntries);
    expect(result.current.currentLink).toBe('some/link');
  });

  it('browseTo navigates to a subdirectory and updates breadcrumbs', async () => {
    const rootEntries = [{ name: 'sub', path: 'sub', type: 'directory' }];
    const subEntries = [{ name: 'file.ts', path: 'sub/file.ts', type: 'file' }];

    mockApiRequest
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootEntries) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ current: null }) });

    const { result } = renderHook(() => usePlaygroundSelector());

    await act(async () => {
      result.current.open();
    });

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(subEntries),
    });

    await act(async () => {
      result.current.browseTo('sub');
    });

    expect(result.current.entries).toEqual(subEntries);
    expect(result.current.breadcrumbs).toEqual(['sub']);
    expect(result.current.canGoBack).toBe(true);
  });

  it('goBack navigates to previous directory', async () => {
    const rootEntries = [{ name: 'sub', path: 'sub', type: 'directory' }];

    mockApiRequest
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootEntries) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ current: null }) });

    const { result } = renderHook(() => usePlaygroundSelector());

    await act(async () => {
      result.current.open();
    });

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await act(async () => {
      result.current.browseTo('sub');
    });

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(rootEntries),
    });

    await act(async () => {
      result.current.goBack();
    });

    expect(result.current.breadcrumbs).toEqual([]);
    expect(result.current.canGoBack).toBe(false);
  });

  it('linkPlayground sends POST and updates currentLink', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, linkedPath: '/opt/fibe/project' }),
    });

    const { result } = renderHook(() => usePlaygroundSelector());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.linkPlayground('project');
    });

    expect(success).toBe(true);
    expect(result.current.currentLink).toBe('project');
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/playrooms/link',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'project' }),
      }),
    );
  });

  it('linkPlayground sets error on failure', async () => {
    mockApiRequest.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => usePlaygroundSelector());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.linkPlayground('bad');
    });

    expect(success).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  it('sets error when browse request fails', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ ok: false, status: 404 }) // fetchEntries -> browse
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ current: 'existing' }) }); // fetchCurrentLink

    const { result } = renderHook(() => usePlaygroundSelector());

    await act(async () => {
      result.current.open();
    });

    expect(result.current.error).toBe('Path not found');
  });

  it('smartMount fetches root and links the first directory', async () => {
    const rootEntries = [
      { name: 'file.ts', path: 'file.ts', type: 'file' },
      { name: 'dir', path: 'dir', type: 'directory' },
    ];

    mockApiRequest
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootEntries) }) // browse
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) }) // link
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootEntries) }); // fetchEntries

    const { result } = renderHook(() => usePlaygroundSelector());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.smartMount();
    });

    expect(success).toBe(true);
    expect(result.current.currentLink).toBe('dir');
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/playrooms/link',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'dir' }),
      }),
    );
  });

  it('smartMount returns false if no directories found', async () => {
    const rootEntries = [
      { name: 'file.ts', path: 'file.ts', type: 'file' },
    ];

    mockApiRequest
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootEntries) });

    const { result } = renderHook(() => usePlaygroundSelector());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.smartMount();
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe('No available playgrounds found');
  });

  it('open() calls smartMount if currentLink is null on first open', async () => {
    const rootEntries = [{ name: 'dir', path: 'dir', type: 'directory' }];

    mockApiRequest
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }) // open -> fetchEntries
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ current: null }) }) // fetchCurrentLink
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootEntries) }) // smartMount -> browse
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) }) // smartMount -> link
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootEntries) }); // smartMount -> fetchEntries

    const { result } = renderHook(() => usePlaygroundSelector());

    await act(async () => {
      await result.current.open();
    });

    expect(result.current.currentLink).toBe('dir');
  });

  it('goToRoot resets path history and fetches root', async () => {
    const rootEntries = [{ name: 'a', path: 'a', type: 'directory' }];

    mockApiRequest
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootEntries) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ current: null }) });

    const { result } = renderHook(() => usePlaygroundSelector());

    await act(async () => {
      result.current.open();
    });

    mockApiRequest.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

    await act(async () => {
      result.current.browseTo('a');
    });

    mockApiRequest.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootEntries) });

    await act(async () => {
      result.current.goToRoot();
    });

    expect(result.current.breadcrumbs).toEqual([]);
    expect(result.current.canGoBack).toBe(false);
  });

  it('browseTo with a symlink entry updates breadcrumbs like a directory', async () => {
    const rootEntries = [
      { name: 'playzones', path: 'playzones', type: 'directory' },
    ];
    const symlinkEntries = [
      { name: 'example-backend', path: 'playzones/example-backend', type: 'symlink' },
    ];

    mockApiRequest
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootEntries) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ current: null }) });

    const { result } = renderHook(() => usePlaygroundSelector());

    await act(async () => {
      result.current.open();
    });

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(symlinkEntries),
    });

    await act(async () => {
      result.current.browseTo('playzones');
    });

    expect(result.current.entries).toEqual(symlinkEntries);
    expect(result.current.breadcrumbs).toEqual(['playzones']);
    expect(result.current.canGoBack).toBe(true);
  });
});
