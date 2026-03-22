import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatLayout } from './use-chat-layout';

describe('useChatLayout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('initializes with expected defaults', () => {
    const { result } = renderHook(() => useChatLayout(false, false));
    expect(typeof result.current.isMobile).toBe('boolean');
    expect(result.current.sidebarOpen).toBe(false);
    expect(result.current.rightSidebarOpen).toBe(false);
    expect(typeof result.current.settingsOpen).toBe('boolean');
    expect(result.current.searchQuery).toBe('');
  });

  it('setSidebarOpen updates sidebarOpen', () => {
    const { result } = renderHook(() => useChatLayout(false, false));
    act(() => { result.current.setSidebarOpen(true); });
    expect(result.current.sidebarOpen).toBe(true);
  });

  it('setRightSidebarOpen updates rightSidebarOpen', () => {
    const { result } = renderHook(() => useChatLayout(false, false));
    act(() => { result.current.setRightSidebarOpen(true); });
    expect(result.current.rightSidebarOpen).toBe(true);
  });

  it('setSettingsOpen updates settingsOpen', () => {
    const { result } = renderHook(() => useChatLayout(false, false));
    act(() => { result.current.setSettingsOpen(true); });
    expect(result.current.settingsOpen).toBe(true);
  });

  it('setSearchQuery updates searchQuery', () => {
    const { result } = renderHook(() => useChatLayout(false, false));
    act(() => { result.current.setSearchQuery('hello'); });
    expect(result.current.searchQuery).toBe('hello');
  });

  it('closeMobileSidebar sets sidebarOpen to false', () => {
    const { result } = renderHook(() => useChatLayout(false, false));
    act(() => { result.current.setSidebarOpen(true); });
    act(() => { result.current.closeMobileSidebar(); });
    expect(result.current.sidebarOpen).toBe(false);
  });

  it('closeSettings sets settingsOpen to false', () => {
    const { result } = renderHook(() => useChatLayout(false, false));
    act(() => { result.current.setSettingsOpen(true); });
    act(() => { result.current.closeSettings(); });
    expect(result.current.settingsOpen).toBe(false);
  });

  it('setSidebarCollapsed updates sidebarCollapsed', () => {
    const { result } = renderHook(() => useChatLayout(false, false));
    const prev = result.current.sidebarCollapsed;
    act(() => { result.current.setSidebarCollapsed(!prev); });
    expect(result.current.sidebarCollapsed).toBe(!prev);
  });

  it('setRightSidebarCollapsed updates rightSidebarCollapsed', () => {
    const { result } = renderHook(() => useChatLayout(false, false));
    const prev = result.current.rightSidebarCollapsed;
    act(() => { result.current.setRightSidebarCollapsed(!prev); });
    expect(result.current.rightSidebarCollapsed).toBe(!prev);
  });

  it('auto-expands sidebar when playground files first appear', () => {
    const { result, rerender } = renderHook(
      ({ hasFiles, loading }) => useChatLayout(hasFiles, loading),
      { initialProps: { hasFiles: false, loading: false } }
    );
    act(() => { result.current.setSidebarCollapsed(true); });
    rerender({ hasFiles: true, loading: false });
    expect(result.current.sidebarCollapsed).toBe(false);
  });

  it('does not auto-expand sidebar when loading', () => {
    const { result, rerender } = renderHook(
      ({ hasFiles, loading }) => useChatLayout(hasFiles, loading),
      { initialProps: { hasFiles: false, loading: true } }
    );
    act(() => { result.current.setSidebarCollapsed(true); });
    rerender({ hasFiles: true, loading: true });
    expect(result.current.sidebarCollapsed).toBe(true);
  });

  it('detects mobile viewport on mount', () => {
    // Override window.innerWidth to be below breakpoint
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 600 });
    const { result } = renderHook(() => useChatLayout(false, false));
    expect(result.current.isMobile).toBe(true);
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
  });

  it('handles window resize events', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    const { result } = renderHook(() => useChatLayout(false, false));
    expect(result.current.isMobile).toBe(false);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, value: 500 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.isMobile).toBe(true);

    // Restore
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
  });

  it('closes mobile sidebars when switching to desktop', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 500 });
    const { result } = renderHook(() => useChatLayout(false, false));
    act(() => {
      result.current.setSidebarOpen(true);
      result.current.setRightSidebarOpen(true);
    });

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.sidebarOpen).toBe(false);
    expect(result.current.rightSidebarOpen).toBe(false);
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
  });

  it('toggles sidebar collapsed with Cmd+B keyboard shortcut', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    const { result } = renderHook(() => useChatLayout(false, false));
    const prev = result.current.sidebarCollapsed;

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }));
    });
    expect(result.current.sidebarCollapsed).toBe(!prev);
  });

  it('toggles right sidebar collapsed with Cmd+Shift+B', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    const { result } = renderHook(() => useChatLayout(false, false));
    const prev = result.current.rightSidebarCollapsed;

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, shiftKey: true }));
    });
    expect(result.current.rightSidebarCollapsed).toBe(!prev);
  });

  it('Cmd+B does nothing in mobile mode', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 500 });
    const { result } = renderHook(() => useChatLayout(false, false));
    const prev = result.current.sidebarCollapsed;

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }));
    });
    expect(result.current.sidebarCollapsed).toBe(prev);
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
  });
});
