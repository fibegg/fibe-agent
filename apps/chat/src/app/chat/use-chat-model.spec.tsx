import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatModel } from './use-chat-model';

describe('useChatModel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps an explicit selection when older typed input is pending', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useChatModel({ current: send }));
    act(() => result.current.handleModelInputChange('old-model'));
    act(() => result.current.handleModelSelect('selected-model'));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.currentModel).toBe('selected-model');
    expect(send.mock.calls).toEqual([[{ action: 'set_model', model: 'selected-model' }]]);
  });

  it('does not send typed input after leaving the chat', () => {
    const send = vi.fn();
    const { result, unmount } = renderHook(() => useChatModel({ current: send }));
    act(() => result.current.handleModelInputChange('draft-model'));
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(send).not.toHaveBeenCalled();
  });

  it('sends only the latest trimmed typed value after the debounce', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useChatModel({ current: send }));
    act(() => result.current.handleModelInputChange('first'));
    act(() => result.current.handleModelInputChange(' latest '));
    act(() => vi.advanceTimersByTime(500));
    expect(send.mock.calls).toEqual([[{ action: 'set_model', model: 'latest' }]]);
  });
});
