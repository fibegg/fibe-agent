import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatInput } from './use-chat-input';

describe('useChatInput', () => {
  it('returns empty inputValue and cursorOffset initially', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    expect(result.current.inputValue).toBe('');
    expect(result.current.cursorOffset).toBe(0);
  });

  it('setInputState updates input value', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    act(() => {
      result.current.setInputState({ value: 'hello', cursor: 5 });
    });
    expect(result.current.inputValue).toBe('hello');
    expect(result.current.cursorOffset).toBe(5);
  });

  it('handleKeyDown calls onSendRef when Enter without shift and mention not open', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    act(() => {
      result.current.setInputState({ value: 'hi', cursor: 2 });
    });
    const e = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() };
    act(() => {
      result.current.handleKeyDown(e as unknown as React.KeyboardEvent);
    });
    expect(onSendRef.current).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('handleKeyDown does not call onSendRef when shiftKey is true', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    const e = { key: 'Enter', shiftKey: true, preventDefault: vi.fn() };
    act(() => {
      result.current.handleKeyDown(e as unknown as React.KeyboardEvent);
    });
    expect(onSendRef.current).not.toHaveBeenCalled();
  });

  it('handleMentionSelect inserts path and updates input', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    act(() => {
      result.current.setInputState({ value: '@', cursor: 1 });
    });
    act(() => {
      result.current.handleMentionSelect('src/index.ts');
    });
    expect(result.current.inputValue).toContain('@src/index.ts');
    expect(result.current.cursorOffset).toBe(result.current.inputValue.length);
  });

  it('returns chatInputRef', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    expect(result.current.chatInputRef).toEqual({ current: null });
  });
});
