import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiffPanel } from './use-diff-panel';

describe('useDiffPanel', () => {
  it('starts with diff closed', () => {
    const { result } = renderHook(() => useDiffPanel());
    expect(result.current.diffOpen).toBe(false);
  });

  it('toggleDiff opens the diff when closed', () => {
    const { result } = renderHook(() => useDiffPanel());
    act(() => { result.current.toggleDiff(); });
    expect(result.current.diffOpen).toBe(true);
  });

  it('toggleDiff closes the diff when open', () => {
    const { result } = renderHook(() => useDiffPanel());
    act(() => { result.current.toggleDiff(); });
    act(() => { result.current.toggleDiff(); });
    expect(result.current.diffOpen).toBe(false);
  });

  it('openDiff sets diffOpen to true', () => {
    const { result } = renderHook(() => useDiffPanel());
    act(() => { result.current.openDiff(); });
    expect(result.current.diffOpen).toBe(true);
  });

  it('closeDiff sets diffOpen to false after opening', () => {
    const { result } = renderHook(() => useDiffPanel());
    act(() => { result.current.openDiff(); });
    act(() => { result.current.closeDiff(); });
    expect(result.current.diffOpen).toBe(false);
  });

  it('openDiff is idempotent', () => {
    const { result } = renderHook(() => useDiffPanel());
    act(() => { result.current.openDiff(); });
    act(() => { result.current.openDiff(); });
    expect(result.current.diffOpen).toBe(true);
  });

  it('closeDiff is idempotent when already closed', () => {
    const { result } = renderHook(() => useDiffPanel());
    act(() => { result.current.closeDiff(); });
    expect(result.current.diffOpen).toBe(false);
  });

  it('returns stable callback references across re-renders', () => {
    const { result, rerender } = renderHook(() => useDiffPanel());
    const { toggleDiff, openDiff, closeDiff } = result.current;
    rerender();
    expect(result.current.toggleDiff).toBe(toggleDiff);
    expect(result.current.openDiff).toBe(openDiff);
    expect(result.current.closeDiff).toBe(closeDiff);
  });
});
