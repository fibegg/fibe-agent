import { useCallback, useEffect, useRef, useState } from 'react';
import { getAtMentionState, valueAfterAtMatchesEntry } from './file-mention-dropdown';
import type { PlaygroundEntryItem } from './use-playground-files';

export interface UseChatInputParams {
  playgroundEntries: PlaygroundEntryItem[];
  onSendRef: React.MutableRefObject<() => void>;
}

interface FocusInputOptions {
  persistent?: boolean;
}

const POST_SEND_FOCUS_RECOVERY_MS = 250;
const POST_SEND_FOCUS_RETRY_DELAYS_MS = [0, 25, 75, 150, 250];
const PARENT_FOCUS_RELEASE_SUPPRESSION_MS = 1000;
const PARENT_FOCUS_REQUEST_MESSAGE_TYPE = 'fibe_parent_focus_requested';

function isEmbeddedFrame(): boolean {
  return typeof window !== 'undefined' && window !== window.parent;
}

function selectionIsInsideElement(el: HTMLElement): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const sel = window.getSelection();
  return !!sel?.anchorNode && el.contains(sel.anchorNode);
}

function restoreCaretAtEnd(el: HTMLElement): void {
  if (!(el instanceof HTMLElement)) return;
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function useChatInput({ playgroundEntries, onSendRef }: UseChatInputParams) {
  const [inputState, setInputState] = useState({ value: '', cursor: 0 });
  const [mentionDropdownClosedAfterSelect, setMentionDropdownClosedAfterSelect] = useState(false);
  const chatInputRef = useRef<HTMLDivElement>(null);
  const focusTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const forceFocusUntilRef = useRef(0);
  const suppressBlurRefocusUntilRef = useRef(0);
  const blurRefocusRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  const inputValue = inputState.value;
  const cursorOffset = inputState.cursor;
  const atMention = getAtMentionState(inputValue, cursorOffset);
  const mentionOpen =
    atMention.show &&
    !mentionDropdownClosedAfterSelect &&
    !valueAfterAtMatchesEntry(inputValue, playgroundEntries);

  const clearFocusTimeouts = useCallback(() => {
    for (const timeoutId of focusTimeoutsRef.current) {
      clearTimeout(timeoutId);
    }
    focusTimeoutsRef.current = [];
  }, []);

  const cancelBlurRefocus = useCallback(() => {
    if (blurRefocusRafRef.current !== null) {
      cancelAnimationFrame(blurRefocusRafRef.current);
      blurRefocusRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!atMention.show) setMentionDropdownClosedAfterSelect(false);
  }, [atMention.show]);

  const focusChatInput = useCallback((force = false) => {
    const el = chatInputRef.current;
    if (!el) return;
    const active = document.activeElement;
    const activeIsInsideInput = el instanceof HTMLElement && active instanceof Node && el.contains(active);
    const canTakeFocus = !active || active === document.body || active === el || activeIsInsideInput;
    if (!canTakeFocus) {
      forceFocusUntilRef.current = 0;
      return;
    }
    if (force && isEmbeddedFrame()) {
      try {
        window.focus();
      } catch {
        // Some embedded hosts disallow programmatic frame focus.
      }
    }
    if (force || canTakeFocus) {
      el.focus({ preventScroll: true });
      if (!selectionIsInsideElement(el)) {
        restoreCaretAtEnd(el);
      }
    }
  }, []);

  const focusInput = useCallback((options: FocusInputOptions = {}) => {
    const persistent = options.persistent === true;
    if (persistent) {
      forceFocusUntilRef.current = Date.now() + POST_SEND_FOCUS_RECOVERY_MS;
    }
    clearFocusTimeouts();
    const delays = persistent ? POST_SEND_FOCUS_RETRY_DELAYS_MS : [50];
    focusTimeoutsRef.current = delays.map((delay) =>
      setTimeout(() => {
        const force = persistent && Date.now() <= forceFocusUntilRef.current;
        focusChatInput(force);
      }, delay)
    );
  }, [clearFocusTimeouts, focusChatInput]);

  useEffect(() => {
    return () => {
      clearFocusTimeouts();
    };
  }, [clearFocusTimeouts]);

  useEffect(() => {
    if (!isEmbeddedFrame()) return;

    const releaseChatFocus = () => {
      forceFocusUntilRef.current = 0;
      suppressBlurRefocusUntilRef.current = Date.now() + PARENT_FOCUS_RELEASE_SUPPRESSION_MS;
      clearFocusTimeouts();
      cancelBlurRefocus();

      const el = chatInputRef.current;
      if (!el) return;

      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        active.blur();
      } else if (active instanceof Node && (active === el || el.contains(active))) {
        el.blur();
      }

      if (selectionIsInsideElement(el)) {
        window.getSelection()?.removeAllRanges();
      }
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== PARENT_FOCUS_REQUEST_MESSAGE_TYPE) return;

      releaseChatFocus();
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [cancelBlurRefocus, clearFocusTimeouts]);

  /**
   * Iframe focus recovery must be conservative: a blur often means the user is
   * trying to use Rails chrome outside this frame. Only restore focus during
   * the short post-send recovery window, and never after the parent explicitly
   * requests focus for its own UI.
   */
  useEffect(() => {
    const isEmbedded = isEmbeddedFrame();
    if (!isEmbedded) return;

    const onWindowBlur = () => {
      blurRefocusRafRef.current = requestAnimationFrame(() => {
        blurRefocusRafRef.current = null;
        if (Date.now() <= suppressBlurRefocusUntilRef.current) return;

        const force = Date.now() <= forceFocusUntilRef.current;
        if (!force) return;

        focusChatInput(true);
      });
    };

    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      cancelBlurRefocus();
    };
  }, [cancelBlurRefocus, focusChatInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (mentionOpen || e.defaultPrevented) return;
        e.preventDefault();
        onSendRef.current();
        focusInput({ persistent: true });
      }
    },
    [onSendRef, mentionOpen, focusInput]
  );

  const handleMentionSelect = useCallback(
    (path: string) => {
      setMentionDropdownClosedAfterSelect(true);
      const inserted = `@${path} `;
      setInputState((prev) => {
        const newVal = prev.value.slice(0, atMention.replaceStart) + inserted + prev.value.slice(prev.cursor);
        return { value: newVal, cursor: atMention.replaceStart + inserted.length };
      });
      focusInput();
    },
    [atMention.replaceStart, focusInput]
  );

  const handleMentionClose = useCallback(() => {
    setInputState((prev) => {
      const newVal = prev.value.slice(0, atMention.replaceStart) + prev.value.slice(prev.cursor);
      return { value: newVal, cursor: atMention.replaceStart };
    });
    focusInput();
  }, [atMention.replaceStart, focusInput]);

  return {
    inputValue,
    cursorOffset,
    inputState,
    setInputState,
    atMention,
    mentionOpen,
    chatInputRef,
    handleKeyDown,
    handleMentionSelect,
    handleMentionClose,
    focusInput,
  };
}
