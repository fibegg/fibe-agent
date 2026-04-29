import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { WS_ACTION } from '@shared/ws-constants';
import { useChatEffort } from './use-chat-effort';

describe('useChatEffort', () => {
  it('returns max initially', () => {
    const sendRef = { current: vi.fn() };
    const { result } = renderHook(() => useChatEffort(sendRef));
    expect(result.current.currentEffort).toBe('max');
  });

  it('handleEffortSelect updates currentEffort and calls send with set_effort', () => {
    const sendRef = { current: vi.fn() };
    const { result } = renderHook(() => useChatEffort(sendRef));

    act(() => {
      result.current.handleEffortSelect('high');
    });

    expect(result.current.currentEffort).toBe('high');
    expect(sendRef.current).toHaveBeenCalledWith({ action: WS_ACTION.SET_EFFORT, effort: 'high' });
  });

  it('normalizes invalid values to max', () => {
    const sendRef = { current: vi.fn() };
    const { result } = renderHook(() => useChatEffort(sendRef));

    act(() => {
      result.current.handleEffortSelect('invalid');
    });

    expect(result.current.currentEffort).toBe('max');
    expect(sendRef.current).toHaveBeenCalledWith({ action: WS_ACTION.SET_EFFORT, effort: 'max' });
  });
});
