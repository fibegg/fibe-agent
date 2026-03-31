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

  it('handleStreamChunk buffers chunks and flushes after 60ms timeout', () => {
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );

    act(() => {
      result.current.handleStreamChunk('Hello ');
    });

    expect(result.current.streamingText).toBe('');

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(result.current.streamingText).toBe('Hello ');
  });

  it('multiple chunks merge into one flush', () => {
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );

    act(() => {
      result.current.handleStreamChunk('Foo');
      result.current.handleStreamChunk('Bar');
    });

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(result.current.streamingText).toBe('FooBar');
  });

  it('second chunk does not create a second timer', () => {
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    act(() => {
      result.current.handleStreamChunk('A');
      result.current.handleStreamChunk('B');
    });

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
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

  it('handleStreamStart cancels pending timer', () => {
    const resetForNewStream = vi.fn();
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream })
    );
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    act(() => {
      result.current.handleStreamChunk('Partial');
    });

    act(() => {
      result.current.handleStreamStart();
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(result.current.streamingText).toBe('');
    expect(resetForNewStream).toHaveBeenCalled();
  });

  it('setStreamingText is exposed and updates state', () => {
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );

    act(() => {
      result.current.setStreamingText('override');
    });

    expect(result.current.streamingText).toBe('override');
  });

  it('cleans up timeout on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    act(() => {
      result.current.handleStreamChunk('pending');
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('empty buffer does not update streamingText on flush', () => {
    const { result } = renderHook(() =>
      useChatStreaming({ onStreamEndCallback: vi.fn(), resetForNewStream: vi.fn() })
    );

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(result.current.streamingText).toBe('');
  });
});
