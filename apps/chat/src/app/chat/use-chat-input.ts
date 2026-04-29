import { useCallback, useEffect, useRef, useState } from 'react';
import { getAtMentionState, valueAfterAtMatchesEntry } from './file-mention-dropdown';
import type { PlaygroundEntryItem } from './use-playground-files';

export interface UseChatInputParams {
  playgroundEntries: PlaygroundEntryItem[];
  onSendRef: React.MutableRefObject<() => void>;
  isMobile?: boolean; // Mobile allows raw Enter for newlines
}

export function useChatInput({ playgroundEntries, onSendRef, isMobile }: UseChatInputParams) {
  const [inputState, setInputState] = useState({ value: '', cursor: 0 });
  const [mentionDropdownClosedAfterSelect, setMentionDropdownClosedAfterSelect] = useState(false);
  const chatInputRef = useRef<HTMLDivElement>(null);

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

  const focusInput = useCallback(() => {
    setTimeout(() => chatInputRef.current?.focus(), 50);
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
    const isEmbedded = typeof window !== 'undefined' && window !== window.parent;
    if (!isEmbedded) return;

    let rafId: ReturnType<typeof requestAnimationFrame>;

    const onWindowBlur = () => {
      rafId = requestAnimationFrame(() => {
        // After the rAF, if no element inside the iframe owns focus, restore it.
        const active = document.activeElement;
        if (!active || active === document.body) {
          chatInputRef.current?.focus();
        }
      });
    };

    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      cancelAnimationFrame(rafId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (mentionOpen || isMobile) return;
        e.preventDefault();
        onSendRef.current();
        focusInput();
      }
    },
    [onSendRef, mentionOpen, isMobile, focusInput]
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
