import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseChatStreamingProps {
  onStreamEndCallback: (
    finalText: string,
    usage?: { inputTokens: number; outputTokens: number },
    model?: string,
    streamModel?: string | null
  ) => void;
  resetForNewStream: (data?: { model?: string }) => void;
}

export function useChatStreaming({
  onStreamEndCallback,
  resetForNewStream,
}: UseChatStreamingProps) {
  const [streamingText, setStreamingText] = useState('');
  const streamBufferRef = useRef('');
  const timeoutIdRef = useRef<number | null>(null);
  const streamModelRef = useRef<string | null>(null);

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

  const finalTextRef = useRef('');

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
      resetForNewStream(data);
    },
    [resetForNewStream]
  );

  const handleStreamChunk = useCallback(
    (chunk: string) => {
      streamBufferRef.current += chunk;
      finalTextRef.current += chunk;
      if (timeoutIdRef.current === null) {
        // Align flushes to the display refresh cycle. rAF pauses automatically
        // when the tab is hidden, saving wasted renders and timer drift.
        timeoutIdRef.current = requestAnimationFrame(flushStreamBuffer);
      }
    },
    [flushStreamBuffer]
  );

  const handleStreamEnd = useCallback(
    (
      usage?: { inputTokens: number; outputTokens: number },
      model?: string
    ) => {
      onStreamEndCallback(finalTextRef.current, usage, model, streamModelRef.current);
    },
    [onStreamEndCallback]
  );

  return {
    streamingText,
    setStreamingText,
    handleStreamStart,
    handleStreamChunk,
    handleStreamEnd,
  };
}
