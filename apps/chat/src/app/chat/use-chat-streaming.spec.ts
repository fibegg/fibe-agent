import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatStreaming } from './use-chat-streaming';

describe('useChatStreaming', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initialises with empty streamingText', () => {
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );
    expect(result.current.streamingText).toBe('');
  });

  it('handleStreamStart clears text and calls resetForNewStream', () => {
    const resetForNewStream = vi.fn();
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream })
    );
    act(() => {
      result.current.handleStreamStart({ model: 'claude-3' });
    });
    expect(result.current.streamingText).toBe('');
    expect(resetForNewStream).toHaveBeenCalledWith({ model: 'claude-3' });
  });

  it('handleStreamStart without model passes undefined model', () => {
    const resetForNewStream = vi.fn();
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream })
    );
    act(() => {
      result.current.handleStreamStart();
    });
    expect(resetForNewStream).toHaveBeenCalledWith(undefined);
  });

  it('handleStreamChunk buffers chunks and flushes on next animation frame', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      setTimeout(cb, 16);
      return 1;
    });
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );

    act(() => {
      result.current.handleStreamChunk('Hello ');
    });

    expect(result.current.streamingText).toBe('');

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(result.current.streamingText).toBe('Hello ');
    rafSpy.mockRestore();
  });

  it('multiple chunks merge into one flush', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      setTimeout(cb, 16);
      return 1;
    });
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );

    act(() => {
      result.current.handleStreamChunk('Foo');
      result.current.handleStreamChunk('Bar');
    });

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(result.current.streamingText).toBe('FooBar');
    rafSpy.mockRestore();
  });

  it('second chunk does not create a second rAF request', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as ReturnType<typeof requestAnimationFrame>);
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );

    act(() => {
      result.current.handleStreamChunk('A');
      result.current.handleStreamChunk('B');
    });

    expect(rafSpy).toHaveBeenCalledTimes(1);
    rafSpy.mockRestore();
  });

  it('handleStreamEnd calls onStreamEndCallback with accumulated text', () => {
    const onStreamEndCallback = vi.fn();
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback, resetForNewStream: vi.fn() })
    );

    act(() => {
      result.current.handleStreamChunk('Hello');
    });

    act(() => {
      result.current.handleStreamEnd({ inputTokens: 10, outputTokens: 5 }, 'claude-3');
    });

    expect(onStreamEndCallback).toHaveBeenCalledWith(
      'Hello',
      { inputTokens: 10, outputTokens: 5 },
      'claude-3',
      null
    );
  });

  it('handleStreamEnd passes model from handleStreamStart', () => {
    const onStreamEndCallback = vi.fn();
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback, resetForNewStream: vi.fn() })
    );

    act(() => {
      result.current.handleStreamStart({ model: 'gpt-4' });
      result.current.handleStreamChunk('World');
    });

    act(() => {
      result.current.handleStreamEnd(undefined, undefined);
    });

    expect(onStreamEndCallback).toHaveBeenCalledWith('World', undefined, undefined, 'gpt-4');
  });

  it('handleStreamStart cancels pending rAF', () => {
    const cancelRafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42 as unknown as ReturnType<typeof requestAnimationFrame>);
    const resetForNewStream = vi.fn();
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream })
    );

    act(() => {
      result.current.handleStreamChunk('Partial');
    });

    act(() => {
      result.current.handleStreamStart();
    });

    expect(cancelRafSpy).toHaveBeenCalled();
    expect(result.current.streamingText).toBe('');
    expect(resetForNewStream).toHaveBeenCalled();
  });

  it('handleStreamAbort clears pending text without calling stream end callback', () => {
    const onStreamEndCallback = vi.fn();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42 as unknown as ReturnType<typeof requestAnimationFrame>);
    const cancelRafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback, resetForNewStream: vi.fn() })
    );

    act(() => {
      result.current.handleStreamStart({ model: 'claude-3' });
      result.current.handleStreamChunk('Partial');
      result.current.handleStreamAbort();
    });

    expect(cancelRafSpy).toHaveBeenCalled();
    expect(result.current.streamingText).toBe('');
    expect(onStreamEndCallback).not.toHaveBeenCalled();
  });

  it('cleans up rAF on unmount', () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(99 as unknown as ReturnType<typeof requestAnimationFrame>);
    const cancelRafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const { result, unmount } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );

    act(() => {
      result.current.handleStreamChunk('pending');
    });

    unmount();

    expect(cancelRafSpy).toHaveBeenCalled();
  });

  it('empty buffer does not update streamingText on flush', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      setTimeout(cb, 16);
      return 1;
    });
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(result.current.streamingText).toBe('');
    rafSpy.mockRestore();
  });
});
