import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminalPanel } from './use-terminal-panel';

describe('useTerminalPanel', () => {
  it('starts with terminal closed', () => {
    const { result } = renderHook(() => useTerminalPanel());
    expect(result.current.terminalOpen).toBe(false);
  });

  it('toggleTerminal opens the terminal when closed', () => {
    const { result } = renderHook(() => useTerminalPanel());
    act(() => { result.current.toggleTerminal(); });
    expect(result.current.terminalOpen).toBe(true);
  });

  it('toggleTerminal closes the terminal when open', () => {
    const { result } = renderHook(() => useTerminalPanel());
    act(() => { result.current.toggleTerminal(); });
    act(() => { result.current.toggleTerminal(); });
    expect(result.current.terminalOpen).toBe(false);
  });

  it('openTerminal sets terminalOpen to true', () => {
    const { result } = renderHook(() => useTerminalPanel());
    act(() => { result.current.openTerminal(); });
    expect(result.current.terminalOpen).toBe(true);
  });

  it('closeTerminal sets terminalOpen to false after opening', () => {
    const { result } = renderHook(() => useTerminalPanel());
    act(() => { result.current.openTerminal(); });
    act(() => { result.current.closeTerminal(); });
    expect(result.current.terminalOpen).toBe(false);
  });

  it('openTerminal is idempotent', () => {
    const { result } = renderHook(() => useTerminalPanel());
    act(() => { result.current.openTerminal(); });
    act(() => { result.current.openTerminal(); });
    expect(result.current.terminalOpen).toBe(true);
  });

  it('returns stable callback references across re-renders', () => {
    const { result, rerender } = renderHook(() => useTerminalPanel());
    const { toggleTerminal, openTerminal, closeTerminal } = result.current;
    rerender();
    expect(result.current.toggleTerminal).toBe(toggleTerminal);
    expect(result.current.openTerminal).toBe(openTerminal);
    expect(result.current.closeTerminal).toBe(closeTerminal);
  });

  it('closeTerminal is idempotent when already closed', () => {
    const { result } = renderHook(() => useTerminalPanel());
    act(() => { result.current.closeTerminal(); });
    expect(result.current.terminalOpen).toBe(false);
  });
});
