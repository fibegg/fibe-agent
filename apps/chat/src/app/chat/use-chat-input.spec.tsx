import { describe, it, expect, vi, afterEach } from 'vitest';
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

  it('handleKeyDown calls onSendRef on Enter in mobile-sized layouts', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    const e = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() };
    act(() => result.current.handleKeyDown(e as unknown as React.KeyboardEvent));
    expect(onSendRef.current).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it('handleKeyDown calls onSendRef on Enter in iframe mode', () => {
    const mockParent = {} as Window;
    Object.defineProperty(window, 'parent', { value: mockParent, writable: true, configurable: true });
    try {
      const onSendRef = { current: vi.fn() };
      const { result } = renderHook(() =>
        useChatInput({ playgroundEntries: [], onSendRef })
      );

      const e = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() };
      act(() => result.current.handleKeyDown(e as unknown as React.KeyboardEvent));

      expect(onSendRef.current).toHaveBeenCalledOnce();
      expect(e.preventDefault).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, 'parent', { value: window, writable: true, configurable: true });
    }
  });

  it('handleKeyDown does not send when event was already handled', () => {
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );
    const e = { key: 'Enter', shiftKey: false, defaultPrevented: true, preventDefault: vi.fn() };
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

    // Flush the deferred persistent focus retries
    act(() => vi.runAllTimers());
    expect(focusMock.mock.calls.length).toBeGreaterThan(1);

    vi.useRealTimers();
  });

  it('focusInput can retry focus during the post-send iframe handoff window', () => {
    vi.useFakeTimers();
    const onSendRef = { current: vi.fn() };
    const { result } = renderHook(() =>
      useChatInput({ playgroundEntries: [], onSendRef })
    );

    const focusMock = vi.fn();
    (result.current.chatInputRef as React.MutableRefObject<unknown>).current = {
      focus: focusMock,
    };

    act(() => result.current.focusInput({ persistent: true }));
    act(() => vi.runAllTimers());

    expect(focusMock.mock.calls.length).toBeGreaterThan(1);

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

  // ── iframe focus-recovery ────────────────────────────────────────────────

  describe('iframe focus-recovery blur listener', () => {
    afterEach(() => {
      // Reset window.parent to itself (standalone mode)
      Object.defineProperty(window, 'parent', { value: window, writable: true, configurable: true });
      vi.restoreAllMocks();
    });

    it('restores focus to chat input on window blur when body is active element (iframe mode)', () => {
      vi.useFakeTimers();

      // Must mock BEFORE rendering so the effect sees isEmbedded = true
      const mockParent = {} as Window;
      Object.defineProperty(window, 'parent', { value: mockParent, writable: true, configurable: true });
      vi.spyOn(window, 'focus').mockImplementation(() => undefined);

      const onSendRef = { current: vi.fn() };
      const { result } = renderHook(() =>
        useChatInput({ playgroundEntries: [], onSendRef })
      );

      const focusMock = vi.fn();
      (result.current.chatInputRef as React.MutableRefObject<unknown>).current = {
        focus: focusMock,
      };

      document.body.focus();

      act(() => {
        window.dispatchEvent(new Event('blur'));
        // Flush requestAnimationFrame
        vi.runAllTimers();
      });

      expect(focusMock).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it('does NOT restore focus when another element is focused (intentional focus)', () => {
      vi.useFakeTimers();

      const mockParent = {} as Window;
      Object.defineProperty(window, 'parent', { value: mockParent, writable: true, configurable: true });
      vi.spyOn(window, 'focus').mockImplementation(() => undefined);

      const onSendRef = { current: vi.fn() };
      const { result } = renderHook(() =>
        useChatInput({ playgroundEntries: [], onSendRef })
      );

      const focusMock = vi.fn();
      (result.current.chatInputRef as React.MutableRefObject<unknown>).current = {
        focus: focusMock,
      };

      // Another element has intentional focus
      const btn = document.createElement('button');
      document.body.appendChild(btn);
      btn.focus();

      act(() => {
        window.dispatchEvent(new Event('blur'));
        vi.runAllTimers();
      });

      expect(focusMock).not.toHaveBeenCalled();

      document.body.removeChild(btn);
      vi.useRealTimers();
    });

    it('restores focus on iframe blur during the post-send focus window even when activeElement is stale', () => {
      vi.useFakeTimers();

      const mockParent = {} as Window;
      Object.defineProperty(window, 'parent', { value: mockParent, writable: true, configurable: true });
      vi.spyOn(window, 'focus').mockImplementation(() => undefined);

      const onSendRef = { current: vi.fn() };
      const { result } = renderHook(() =>
        useChatInput({ playgroundEntries: [], onSendRef })
      );

      const focusMock = vi.fn();
      (result.current.chatInputRef as React.MutableRefObject<unknown>).current = {
        focus: focusMock,
      };

      const btn = document.createElement('button');
      document.body.appendChild(btn);
      btn.focus();

      act(() => result.current.focusInput({ persistent: true }));
      act(() => vi.advanceTimersByTime(0));
      focusMock.mockClear();

      act(() => {
        window.dispatchEvent(new Event('blur'));
        vi.advanceTimersByTime(16);
      });

      expect(focusMock).toHaveBeenCalled();

      document.body.removeChild(btn);
      vi.useRealTimers();
    });

    it('persistent iframe focus requests frame focus and restores the contenteditable caret', () => {
      vi.useFakeTimers();

      const mockParent = {} as Window;
      Object.defineProperty(window, 'parent', { value: mockParent, writable: true, configurable: true });
      const windowFocus = vi.spyOn(window, 'focus').mockImplementation(() => undefined);

      const onSendRef = { current: vi.fn() };
      const { result } = renderHook(() =>
        useChatInput({ playgroundEntries: [], onSendRef })
      );

      const input = document.createElement('div');
      input.contentEditable = 'true';
      input.textContent = 'hello';
      document.body.appendChild(input);
      result.current.chatInputRef.current = input;

      act(() => result.current.focusInput({ persistent: true }));
      act(() => vi.advanceTimersByTime(0));

      const selection = window.getSelection();
      expect(windowFocus).toHaveBeenCalled();
      expect(selection?.anchorNode ? input.contains(selection.anchorNode) : false).toBe(true);

      document.body.removeChild(input);
      vi.useRealTimers();
    });

    it('does NOT attach blur listener in standalone mode (window === window.parent)', () => {
      vi.useFakeTimers();

      // jsdom default: window.parent === window — standalone mode
      const onSendRef = { current: vi.fn() };
      const { result } = renderHook(() =>
        useChatInput({ playgroundEntries: [], onSendRef })
      );

      const focusMock = vi.fn();
      (result.current.chatInputRef as React.MutableRefObject<unknown>).current = {
        focus: focusMock,
      };

      document.body.focus();
      act(() => {
        window.dispatchEvent(new Event('blur'));
        vi.runAllTimers();
      });

      expect(focusMock).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
