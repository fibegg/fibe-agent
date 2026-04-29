import { useCallback, useState } from 'react';

export interface UseDiffPanelResult {
  diffOpen: boolean;
  toggleDiff: () => void;
  openDiff: () => void;
  closeDiff: () => void;
}

export function useDiffPanel(): UseDiffPanelResult {
  const [diffOpen, setDiffOpen] = useState(false);
  const toggleDiff = useCallback(() => setDiffOpen((v) => !v), []);
  const openDiff   = useCallback(() => setDiffOpen(true), []);
  const closeDiff  = useCallback(() => setDiffOpen(false), []);
  return { diffOpen, toggleDiff, openDiff, closeDiff };
}
