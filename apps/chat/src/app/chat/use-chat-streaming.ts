import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UseChatStreamingProps {
  onStreamEndCallback: (
    finalText: string,
    usage?: { inputTokens: number; outputTokens: number },
    model?: string,
    streamModel?: string | null
  ) => void;
  resetForNewStream: (data?: { model?: string }) => void;
  persistenceKey?: string | null;
}

const STREAM_DRAFT_STORAGE_PREFIX = 'fibe-agent:stream-draft:';

function storageKeyFor(persistenceKey?: string | null): string | null {
  const key = persistenceKey?.trim();
  return key ? `${STREAM_DRAFT_STORAGE_PREFIX}${key}` : null;
}

function readPersistedDraft(storageKey: string | null): string {
  if (!storageKey || typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
}

function writePersistedDraft(storageKey: string | null, text: string): void {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    if (text) {
      window.sessionStorage.setItem(storageKey, text);
    } else {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Storage may be disabled in private or embedded browser contexts.
  }
}

export function useChatStreaming({
  onStreamEndCallback,
  resetForNewStream,
  persistenceKey,
}: UseChatStreamingProps) {
  const draftStorageKey = useMemo(
    () => storageKeyFor(persistenceKey),
    [persistenceKey]
  );
  const [streamingText, setStreamingText] = useState(() =>
    readPersistedDraft(draftStorageKey)
  );
  const streamBufferRef = useRef('');
  const timeoutIdRef = useRef<number | null>(null);
  const streamModelRef = useRef<string | null>(null);
  const finalTextRef = useRef(streamingText);

  const flushStreamBuffer = useCallback(() => {
    timeoutIdRef.current = null;
    const buffered = streamBufferRef.current;
    if (buffered) {
      streamBufferRef.current = '';
      setStreamingText((prev) => prev + buffered);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current !== null) {
        cancelAnimationFrame(timeoutIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (timeoutIdRef.current !== null) {
      cancelAnimationFrame(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    streamBufferRef.current = '';
    const restored = readPersistedDraft(draftStorageKey);
    finalTextRef.current = restored;
    setStreamingText(restored);
  }, [draftStorageKey]);

  const handleStreamStart = useCallback(
    (data?: { model?: string }) => {
      if (timeoutIdRef.current !== null) {
        cancelAnimationFrame(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      streamBufferRef.current = '';
      finalTextRef.current = '';
      setStreamingText('');
      streamModelRef.current = data?.model ?? null;
      writePersistedDraft(draftStorageKey, '');
      resetForNewStream(data);
    },
    [draftStorageKey, resetForNewStream]
  );

  const handleStreamChunk = useCallback(
    (chunk: string) => {
      streamBufferRef.current += chunk;
      finalTextRef.current += chunk;
      writePersistedDraft(draftStorageKey, finalTextRef.current);
      if (timeoutIdRef.current === null) {
        // Align flushes to the display refresh cycle. rAF pauses automatically
        // when the tab is hidden, saving wasted renders and timer drift.
        timeoutIdRef.current = requestAnimationFrame(flushStreamBuffer);
      }
    },
    [draftStorageKey, flushStreamBuffer]
  );

  const handleStreamEnd = useCallback(
    (
      usage?: { inputTokens: number; outputTokens: number },
      model?: string
    ) => {
      writePersistedDraft(draftStorageKey, '');
      onStreamEndCallback(finalTextRef.current, usage, model, streamModelRef.current);
    },
    [draftStorageKey, onStreamEndCallback]
  );

  const handleStreamAbort = useCallback(() => {
    if (timeoutIdRef.current !== null) {
      cancelAnimationFrame(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    streamBufferRef.current = '';
    finalTextRef.current = '';
    streamModelRef.current = null;
    setStreamingText('');
  }, []);

  const restorePersistedStream = useCallback(() => {
    const restored = readPersistedDraft(draftStorageKey);
    if (!restored) return '';
    streamBufferRef.current = '';
    finalTextRef.current = restored;
    setStreamingText(restored);
    return restored;
  }, [draftStorageKey]);

  return {
    streamingText,
    handleStreamStart,
    handleStreamChunk,
    handleStreamEnd,
    handleStreamAbort,
    restorePersistedStream,
  };
}
