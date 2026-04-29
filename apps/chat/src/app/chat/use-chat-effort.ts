import { useCallback, useState } from 'react';
import { resolveEffort, type EffortValue } from '@shared/effort.constants';
import { WS_ACTION } from '@shared/ws-constants';

type SendFn = (payload: Record<string, unknown>) => void;

export function useChatEffort(sendRef: React.MutableRefObject<SendFn | (() => void)>) {
  const [currentEffort, setCurrentEffort] = useState<EffortValue>('max');

  const setResolvedCurrentEffort = useCallback((effort: string) => {
    setCurrentEffort(resolveEffort(effort));
  }, []);

  const handleEffortSelect = useCallback((effort: string) => {
    const value = resolveEffort(effort);
    setCurrentEffort(value);
    sendRef.current({ action: WS_ACTION.SET_EFFORT, effort: value });
  }, [sendRef]);

  return {
    currentEffort,
    setCurrentEffort: setResolvedCurrentEffort,
    handleEffortSelect,
  };
}
