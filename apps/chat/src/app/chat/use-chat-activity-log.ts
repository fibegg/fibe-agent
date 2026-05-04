import { useCallback, useMemo, useRef, useState } from 'react';
import type { ThinkingStep, ThinkingActivity, ToolOrFileEvent } from './thinking-types';

function nextActivityId(): string {
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useChatActivityLog(refetchPlaygrounds: () => void) {
  const [activityLog, setActivityLog] = useState<ThinkingActivity[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [reasoningText, setReasoningText] = useState('');
  const activityLogRef = useRef<ThinkingActivity[]>([]);
  const reasoningTextRef = useRef('');
  const thinkingEntryIdRef = useRef<string | null>(null);

  // Sync the ref inside the setter so it is always up-to-date, even when
  // stream_end arrives before the useEffect commit of the previous render.
  const setActivityLogSync = useCallback(
    (updater: React.SetStateAction<ThinkingActivity[]>) => {
      setActivityLog((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        activityLogRef.current = next;
        return next;
      });
    },
    []
  );

  const thinkingCallbacks = useMemo(
    () => ({
      onStreamStartData: (_data: { model?: string }) => {
        /* no-op; model can be used for future display */
      },
      onReasoningStart: () => {
        const id = nextActivityId();
        thinkingEntryIdRef.current = id;
        setActivityLogSync((prev) => [
          ...prev,
          {
            id,
            type: 'reasoning_start',
            message: 'Thinking',
            timestamp: new Date(),
            details: '',
          },
        ]);
      },
      onReasoningChunk: (text: string) => {
        reasoningTextRef.current += text;
        setReasoningText(reasoningTextRef.current);
        const entryId = thinkingEntryIdRef.current;
        if (!entryId) return;
        setActivityLogSync((prev) => {
          const idx = prev.findIndex((e) => e.id === entryId);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], details: reasoningTextRef.current };
          return next;
        });
      },
      onReasoningEnd: () => {
        setActivityLogSync((prev) => {
          const entryId = thinkingEntryIdRef.current;
          if (!entryId) return prev;
          const idx = prev.findIndex((e) => e.id === entryId);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], message: 'Thinking completed' };
          return next;
        });
      },
      onThinkingStep: (step: ThinkingStep) => {
        setThinkingSteps((prev) => {
          const idx = prev.findIndex((s) => s.id === step.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = step;
            return next;
          }
          return [...prev, step];
        });
        setActivityLogSync((prev) => [
          ...prev,
          {
            id: nextActivityId(),
            type: 'step',
            message: `${step.title} – ${step.status}`,
            timestamp: step.timestamp instanceof Date ? step.timestamp : new Date(step.timestamp),
            details: step.details,
            debug: { id: step.id, title: step.title, status: step.status, details: step.details },
          },
        ]);
      },
      onToolOrFile: (event: ToolOrFileEvent) => {
        if (event.kind === 'file_created') refetchPlaygrounds();
        const msg =
          event.kind === 'file_created'
            ? `Created ${event.path ?? event.name}`
            : event.command
              ? event.command
              : `Ran ${event.name}`;
        setActivityLogSync((prev) => [
          ...prev,
          {
            id: nextActivityId(),
            type: event.kind,
            message: msg,
            timestamp: new Date(),
            details:
              event.kind === 'tool_call'
                ? event.details ?? event.summary
                : event.summary ?? (event.kind === 'file_created' ? event.path : undefined),
            command: event.kind === 'tool_call' ? event.command : undefined,
            path: event.path,
            debug: { kind: event.kind, name: event.name, path: event.path, summary: event.summary },
          },
        ]);
      },
    }),
    [refetchPlaygrounds, setActivityLogSync]
  );

  const resetForNewStream = useCallback((data?: { model?: string }) => {
    setReasoningText('');
    setThinkingSteps([]);
    reasoningTextRef.current = '';
    thinkingEntryIdRef.current = null;
    setActivityLogSync([
      {
        id: nextActivityId(),
        type: 'stream_start',
        message: 'Response started',
        timestamp: new Date(),
        details: data?.model ? `Model: ${data.model}` : undefined,
      },
    ]);
  }, [setActivityLogSync]);

  const resetActivityState = useCallback(() => {
    setReasoningText('');
    setThinkingSteps([]);
    reasoningTextRef.current = '';
    thinkingEntryIdRef.current = null;
    setActivityLogSync([]);
  }, [setActivityLogSync]);

  return {
    activityLog,
    activityLogRef,
    thinkingSteps,
    reasoningText,
    setActivityLog: setActivityLogSync,
    setReasoningText,
    setThinkingSteps,
    thinkingCallbacks,
    resetForNewStream,
    resetActivityState,
  };
}
