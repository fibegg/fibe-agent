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
  };
}
