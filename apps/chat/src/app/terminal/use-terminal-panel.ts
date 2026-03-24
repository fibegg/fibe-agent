import { useCallback, useState } from 'react';

export interface UseTerminalPanelResult {
  terminalOpen: boolean;
  toggleTerminal: () => void;
  openTerminal: () => void;
  closeTerminal: () => void;
}

export function useTerminalPanel(): UseTerminalPanelResult {
  const [terminalOpen, setTerminalOpen] = useState(false);
  const toggleTerminal = useCallback(() => setTerminalOpen((v) => !v), []);
  const openTerminal   = useCallback(() => setTerminalOpen(true), []);
  const closeTerminal  = useCallback(() => setTerminalOpen(false), []);
  return { terminalOpen, toggleTerminal, openTerminal, closeTerminal };
}
