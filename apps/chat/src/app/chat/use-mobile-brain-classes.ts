import { useEffect, useMemo, useRef, useState } from 'react';

const BRAIN_COMPLETE_TO_IDLE_MS = 7_000;

const BRAIN_WORKING = { brain: 'text-blue-400', accent: 'text-blue-300' };
const BRAIN_COMPLETE = { brain: 'text-emerald-400', accent: 'text-emerald-300' };
const BRAIN_IDLE = { brain: 'text-violet-400', accent: 'text-violet-300' };

export type LastStoryItemLike = { id: string; type: string } | null;

export function useMobileBrainClasses(
  isStreaming: boolean,
  lastStoryItem: LastStoryItemLike
): { brain: string; accent: string } {
  const [completeSince, setCompleteSince] = useState(0);
  const [transitionToIdle, setTransitionToIdle] = useState(0);
  const lastTaskCompleteIdRef = useRef<string | null>(null);
  const prevStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      lastTaskCompleteIdRef.current = null;
      setCompleteSince(0);
    } else {
      if (prevStreamingRef.current) {
        setCompleteSince(Date.now());
      } else if (
        lastStoryItem?.type === 'task_complete' &&
        lastStoryItem.id !== lastTaskCompleteIdRef.current
      ) {
        lastTaskCompleteIdRef.current = lastStoryItem.id;
        setCompleteSince(Date.now());
      }
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, lastStoryItem?.id, lastStoryItem?.type]);

  useEffect(() => {
    if (isStreaming || !completeSince) return;
    const elapsed = Date.now() - completeSince;
    if (elapsed >= BRAIN_COMPLETE_TO_IDLE_MS) return;
    const remaining = BRAIN_COMPLETE_TO_IDLE_MS - elapsed;
    const t = setTimeout(() => setTransitionToIdle((n) => n + 1), remaining);
    return () => clearTimeout(t);
  }, [isStreaming, completeSince]);

  return useMemo(() => {
    if (isStreaming) return BRAIN_WORKING;
    if (completeSince && Date.now() - completeSince < BRAIN_COMPLETE_TO_IDLE_MS) {
      return BRAIN_COMPLETE;
    }
    return BRAIN_IDLE;
  }, [isStreaming, completeSince, transitionToIdle]);
}
