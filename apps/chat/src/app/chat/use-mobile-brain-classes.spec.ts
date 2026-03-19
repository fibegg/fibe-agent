import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMobileBrainClasses } from './use-mobile-brain-classes';

const BRAIN_COMPLETE_TO_IDLE_MS = 7_000;

describe('useMobileBrainClasses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns working (blue) when streaming', () => {
    const { result } = renderHook(() => useMobileBrainClasses(true, null));
    expect(result.current).toEqual({ brain: 'text-blue-400', accent: 'text-blue-300' });
  });

  it('returns idle (violet) when not streaming and no complete state', () => {
    const { result } = renderHook(() => useMobileBrainClasses(false, null));
    expect(result.current).toEqual({ brain: 'text-violet-400', accent: 'text-violet-300' });
  });

  it('switches to complete then idle after stream end with fake timers', async () => {
    const { result, rerender } = renderHook(
      ({ isStreaming }: { isStreaming: boolean }) => useMobileBrainClasses(isStreaming, null),
      { initialProps: { isStreaming: true } }
    );
    expect(result.current.brain).toBe('text-blue-400');
    rerender({ isStreaming: false });
    expect(result.current.brain).toBe('text-emerald-400');
    await act(async () => {
      vi.advanceTimersByTime(BRAIN_COMPLETE_TO_IDLE_MS);
    });
    expect(result.current.brain).toBe('text-violet-400');
  });

  it('returns complete when last story item is task_complete', () => {
    const lastItem = { id: 'tc-1', type: 'task_complete' };
    const { result } = renderHook(() => useMobileBrainClasses(false, lastItem));
    expect(result.current.brain).toBe('text-emerald-400');
    expect(result.current.accent).toBe('text-emerald-300');
  });

  it('resets to working when streaming starts again', () => {
    const lastItem = { id: 'tc-1', type: 'task_complete' };
    const { result, rerender } = renderHook(
      ({ isStreaming, last }: { isStreaming: boolean; last: typeof lastItem | null }) =>
        useMobileBrainClasses(isStreaming, last),
      { initialProps: { isStreaming: false, last: lastItem } }
    );
    expect(result.current.brain).toBe('text-emerald-400');
    rerender({ isStreaming: true, last: lastItem });
    expect(result.current.brain).toBe('text-blue-400');
  });
});
