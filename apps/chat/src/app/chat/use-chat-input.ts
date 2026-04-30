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

  const inputValue = inputState.value;
  const cursorOffset = inputState.cursor;
  const atMention = getAtMentionState(inputValue, cursorOffset);
  const mentionOpen =
    atMention.show &&
    !mentionDropdownClosedAfterSelect &&
    !valueAfterAtMatchesEntry(inputValue, playgroundEntries);

  useEffect(() => {
    if (!atMention.show) setMentionDropdownClosedAfterSelect(false);
  }, [atMention.show]);

  const focusChatInput = useCallback((force = false) => {
    const el = chatInputRef.current;
    if (!el) return;
    if (force && isEmbeddedFrame()) {
      try {
        window.focus();
      } catch {
        // Some embedded hosts disallow programmatic frame focus.
      }
    }
    const active = document.activeElement;
    if (force || !active || active === document.body || active === el) {
      el.focus({ preventScroll: true });
      if (!selectionIsInsideElement(el)) {
        restoreCaretAtEnd(el);
      }
    }
  }, []);

  const focusInput = useCallback((options: FocusInputOptions = {}) => {
    const persistent = options.persistent === true;
    if (persistent) {
      forceFocusUntilRef.current = Date.now() + 2000;
    }
    for (const timeoutId of focusTimeoutsRef.current) {
      clearTimeout(timeoutId);
    }
    const delays = persistent ? [0, 25, 75, 150, 300, 600, 1000, 1500] : [50];
    focusTimeoutsRef.current = delays.map((delay) =>
      setTimeout(() => {
        const force = persistent && Date.now() <= forceFocusUntilRef.current;
        focusChatInput(force);
      }, delay)
    );
  }, [focusChatInput]);

  useEffect(() => {
    return () => {
      for (const timeoutId of focusTimeoutsRef.current) {
        clearTimeout(timeoutId);
      }
      focusTimeoutsRef.current = [];
    };
  }, []);

  /**
   * Iframe focus-recovery: when the parent window receives a postMessage from
   * this iframe, the browser may shift `document` focus back to the parent,
   * leaving the contenteditable input without a caret. We detect `window blur`
   * (only fires when focus truly leaves this frame) and restore focus to the
   * chat input — but only if nothing else inside the iframe intentionally took
   * focus (e.g. a dropdown, button, or file picker).
   *
   * No-op in standalone (non-iframe) mode.
   */
  useEffect(() => {
    const isEmbedded = isEmbeddedFrame();
    if (!isEmbedded) return;

    let rafId: ReturnType<typeof requestAnimationFrame> | null = null;

    const onWindowBlur = () => {
      rafId = requestAnimationFrame(() => {
        // After a send, the parent may briefly steal iframe focus even though
        // document.activeElement still points at the contenteditable.
        const force = Date.now() <= forceFocusUntilRef.current;
        const active = document.activeElement;
        if (force || !active || active === document.body) {
          focusChatInput(force);
        }
      });
    };

    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [focusChatInput]);

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
