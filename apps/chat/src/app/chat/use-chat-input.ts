import { useCallback, useEffect, useRef, useState } from 'react';
import { getAtMentionState, valueAfterAtMatchesEntry } from './file-mention-dropdown';
import type { PlaygroundEntryItem } from './use-playground-files';

export interface UseChatInputParams {
  playgroundEntries: PlaygroundEntryItem[];
  onSendRef: React.MutableRefObject<() => void>;
}

export function useChatInput({ playgroundEntries, onSendRef }: UseChatInputParams) {
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (mentionOpen) return;
        e.preventDefault();
        onSendRef.current();
        // Defer focus so it fires after window.parent.postMessage triggers
        // DOM mutations in the parent frame (e.g. tab re-sorting), which
        // can otherwise steal focus away from the iframe input.
        setTimeout(() => chatInputRef.current?.focus(), 0);
      }
    },
    [onSendRef, mentionOpen]
  );

  const handleMentionSelect = useCallback(
    (path: string) => {
      setMentionDropdownClosedAfterSelect(true);
      const inserted = `@${path} `;
      const newVal =
        inputValue.slice(0, atMention.replaceStart) +
        inserted +
        inputValue.slice(cursorOffset);
      setInputState({ value: newVal, cursor: newVal.length });
      setTimeout(() => chatInputRef.current?.focus(), 0);
    },
    [inputValue, cursorOffset, atMention.replaceStart]
  );

  const handleMentionClose = useCallback(() => {
    const newVal =
      inputValue.slice(0, atMention.replaceStart) + inputValue.slice(cursorOffset);
    setInputState({ value: newVal, cursor: atMention.replaceStart });
    setTimeout(() => chatInputRef.current?.focus(), 0);
  }, [inputValue, cursorOffset, atMention.replaceStart]);

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
