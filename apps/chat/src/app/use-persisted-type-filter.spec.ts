import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedTypeFilter } from './use-persisted-type-filter';

const STORAGE_KEY = 'fibe:activityTypeFilter';
const SYNC_EVENT = 'fibe:typeFilterSync';

describe('usePersistedTypeFilter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns empty array when localStorage is empty', () => {
    const { result } = renderHook(() => usePersistedTypeFilter());
    expect(result.current[0]).toEqual([]);
  });

  it('reads initial value from localStorage (array format)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['reasoning', 'step']));
    const { result } = renderHook(() => usePersistedTypeFilter());
    expect(result.current[0]).toEqual(['reasoning', 'step']);
  });

  it('migrates old single-string format stored as raw string in JSON', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('reasoning'));
    const { result } = renderHook(() => usePersistedTypeFilter());
    expect(result.current[0]).toEqual(['reasoning']);
  });

  it('returns empty array when localStorage value is invalid JSON type', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bad: 'obj' }));
    const { result } = renderHook(() => usePersistedTypeFilter());
    expect(result.current[0]).toEqual([]);
  });

  it('sets filter and writes to localStorage', () => {
    const { result } = renderHook(() => usePersistedTypeFilter());
    act(() => {
      result.current[1](['tool_call']);
    });
    expect(result.current[0]).toEqual(['tool_call']);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(['tool_call']));
  });

  it('removes key from localStorage when filter is empty', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['tool_call']));
    const { result } = renderHook(() => usePersistedTypeFilter());
    act(() => {
      result.current[1]([]);
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('dispatches sync event when filter changes', () => {
    const handler = vi.fn();
    window.addEventListener(SYNC_EVENT, handler);

    const { result } = renderHook(() => usePersistedTypeFilter());
    act(() => {
      result.current[1](['step']);
    });

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(SYNC_EVENT, handler);
  });

  it('syncs state when SYNC_EVENT is dispatched externally', () => {
    const { result } = renderHook(() => usePersistedTypeFilter());

    act(() => {
      window.dispatchEvent(
        new CustomEvent(SYNC_EVENT, { detail: ['file_created'] })
      );
    });

    expect(result.current[0]).toEqual(['file_created']);
  });

  it('syncs state when storage event fires for STORAGE_KEY', () => {
    const { result } = renderHook(() => usePersistedTypeFilter());

    act(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['reasoning']));
      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEY })
      );
    });

    expect(result.current[0]).toEqual(['reasoning']);
  });

  it('ignores storage events for other keys', () => {
    const { result } = renderHook(() => usePersistedTypeFilter());

    act(() => {
      result.current[1](['step']);
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'other_key' })
      );
    });

    expect(result.current[0]).toEqual(['step']);
  });
});
