import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatModel } from './use-chat-model';

describe('useChatModel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns currentModel initially empty', () => {
    const sendRef = { current: vi.fn() };
    const { result } = renderHook(() => useChatModel(sendRef));
    expect(result.current.currentModel).toBe('');
  });

  it('setCurrentModel updates currentModel', () => {
    const sendRef = { current: vi.fn() };
    const { result } = renderHook(() => useChatModel(sendRef));
    act(() => {
      result.current.setCurrentModel('gpt-4');
    });
    expect(result.current.currentModel).toBe('gpt-4');
  });

  it('handleModelSelect updates currentModel and calls send with set_model', () => {
    const sendRef = { current: vi.fn() };
    const { result } = renderHook(() => useChatModel(sendRef));
    act(() => {
      result.current.handleModelSelect('claude-3');
    });
    expect(result.current.currentModel).toBe('claude-3');
    expect(sendRef.current).toHaveBeenCalledWith({ action: 'set_model', model: 'claude-3' });
  });

  it('handleModelInputChange updates currentModel immediately', () => {
    const sendRef = { current: vi.fn() };
    const { result } = renderHook(() => useChatModel(sendRef));
    act(() => {
      result.current.handleModelInputChange('custom');
    });
    expect(result.current.currentModel).toBe('custom');
  });

  it('handleModelInputChange calls send after debounce with trimmed model', () => {
    const sendRef = { current: vi.fn() };
    const { result } = renderHook(() => useChatModel(sendRef));
    act(() => {
      result.current.handleModelInputChange('  flash  ');
    });
    expect(sendRef.current).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(sendRef.current).toHaveBeenCalledWith({ action: 'set_model', model: 'flash' });
  });
});
