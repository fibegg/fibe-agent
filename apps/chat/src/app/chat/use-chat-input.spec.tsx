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

  it('setInputState updates input value and cursor', () => {
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

  it('returns chatInputRef initialised to null', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    expect(result.current.chatInputRef).toEqual({ current: null });
  });

  // ── handleKeyDown ────────────────────────────────────────────────────────

  it('handleKeyDown calls onSendRef on Enter without shift', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    act(() => result.current.setInputState({ value: 'hi', cursor: 2 }));

    const e = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() };
    act(() => result.current.handleKeyDown(e as unknown as React.KeyboardEvent));

    expect(onSendRef.current).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it('handleKeyDown does not call onSendRef when shiftKey is true', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    const e = { key: 'Enter', shiftKey: true, preventDefault: vi.fn() };
    act(() => result.current.handleKeyDown(e as unknown as React.KeyboardEvent));
    expect(onSendRef.current).not.toHaveBeenCalled();
  });

  it('handleKeyDown does not call onSendRef when isMobile is true', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef, isMobile: true })
    );
    const e = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() };
    act(() => result.current.handleKeyDown(e as unknown as React.KeyboardEvent));
    expect(onSendRef.current).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('handleKeyDown does not call onSendRef for non-Enter keys', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    const e = { key: 'a', shiftKey: false, preventDefault: vi.fn() };
    act(() => result.current.handleKeyDown(e as unknown as React.KeyboardEvent));
    expect(onSendRef.current).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('handleKeyDown defers focus via setTimeout so parent postMessage mutations settle first', () => {
    vi.useFakeTimers();
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );

    const focusMock = vi.fn();
    // Attach a fake DOM node so the focus call has something to call
    (result.current.chatInputRef as React.MutableRefObject<unknown>).current = {
      focus: focusMock,
    };

    const e = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() };
    act(() => result.current.handleKeyDown(e as unknown as React.KeyboardEvent));

    // focus must NOT have been called synchronously
    expect(focusMock).not.toHaveBeenCalled();

    // Flush the deferred setTimeout(fn, 0)
    act(() => vi.runAllTimers());
    expect(focusMock).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  // ── handleMentionSelect ──────────────────────────────────────────────────

  it('handleMentionSelect inserts path and moves cursor to end', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    act(() => result.current.setInputState({ value: '@', cursor: 1 }));
    act(() => result.current.handleMentionSelect('src/index.ts'));

    expect(result.current.inputValue).toContain('@src/index.ts');
    expect(result.current.cursorOffset).toBe(result.current.inputValue.length);
  });

  it('handleMentionSelect inserts path correctly in the middle of text', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    // "prefix @ suffix" -> user typing @ at cursor 8
    act(() => result.current.setInputState({ value: 'prefix @ suffix', cursor: 8 }));
    act(() => result.current.handleMentionSelect('lib/util.ts'));

    expect(result.current.inputValue).toBe('prefix @lib/util.ts  suffix');
    expect(result.current.cursorOffset).toBe('prefix @lib/util.ts '.length);
  });

  it('handleMentionSelect defers focus via setTimeout', () => {
    vi.useFakeTimers();
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );

    const focusMock = vi.fn();
    (result.current.chatInputRef as React.MutableRefObject<unknown>).current = {
      focus: focusMock,
    };

    act(() => {
      result.current.setInputState({ value: '@', cursor: 1 });
      result.current.handleMentionSelect('lib/foo.ts');
    });

    expect(focusMock).not.toHaveBeenCalled();
    act(() => vi.runAllTimers());
    expect(focusMock).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  // ── handleMentionClose ───────────────────────────────────────────────────

  it('handleMentionClose removes the in-progress @-query from the value', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    // Simulate user having typed "@foo" at position 4
    act(() => result.current.setInputState({ value: '@foo', cursor: 4 }));
    act(() => result.current.handleMentionClose());

    // The @-query should be stripped; value becomes ''
    expect(result.current.inputValue).toBe('');
  });

  it('handleMentionClose defers focus via setTimeout', () => {
    vi.useFakeTimers();
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );

    const focusMock = vi.fn();
    (result.current.chatInputRef as React.MutableRefObject<unknown>).current = {
      focus: focusMock,
    };

    act(() => {
      result.current.setInputState({ value: '@partial', cursor: 8 });
      result.current.handleMentionClose();
    });

    expect(focusMock).not.toHaveBeenCalled();
    act(() => vi.runAllTimers());
    expect(focusMock).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });
});
