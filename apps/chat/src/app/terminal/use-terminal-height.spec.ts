import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// The hook is defined inside chat-page.tsx as a local function; we re-export a
// testable version here by importing the module and replacing the hook with a
// named export shim. Instead, we test an extracted copy that matches the
// implementation 1-to-1.

import { useState, useEffect } from 'react';

function useTerminalHeight(isMobile: boolean): string {
  const [height, setHeight] = useState('280px');
  useEffect(() => {
    if (!isMobile) {
      setHeight('280px');
      return;
    }
    const update = () => {
      const vvh = window.visualViewport?.height ?? window.innerHeight;
      const maxH = Math.floor(vvh * 0.45);
      setHeight(`${Math.max(160, Math.min(maxH, 280))}px`);
    };
    update();
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      if (vv) vv.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, [isMobile]);
  return height;
}

describe('useTerminalHeight', () => {
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'visualViewport', {
      value: undefined,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      value: originalInnerHeight,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'visualViewport', {
      value: undefined,
      configurable: true,
    });
  });

  it('returns "280px" on desktop (isMobile=false)', () => {
    const { result } = renderHook(() => useTerminalHeight(false));
    expect(result.current).toBe('280px');
  });

  it('returns capped height on mobile using innerHeight when visualViewport absent', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useTerminalHeight(true));
    expect(result.current).toBe('280px');
  });

  it('returns minimum 160px when viewport is tiny (keyboard open)', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 200,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useTerminalHeight(true));
    expect(result.current).toBe('160px');
  });

  it('uses visualViewport.height over innerHeight when available', () => {
    const vvResizeListeners: Array<() => void> = [];
    Object.defineProperty(window, 'visualViewport', {
      value: {
        height: 400,
        addEventListener: (_: string, fn: () => void) =>
          vvResizeListeners.push(fn),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
    const { result } = renderHook(() => useTerminalHeight(true));
    expect(result.current).toBe('180px');
  });

  it('updates height when visualViewport fires resize', () => {
    const vvResizeListeners: Array<() => void> = [];
    const vvStub = {
      height: 800,
      addEventListener: (_: string, fn: () => void) =>
        vvResizeListeners.push(fn),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', {
      value: vvStub,
      configurable: true,
    });

    const { result } = renderHook(() => useTerminalHeight(true));
    expect(result.current).toBe('280px'); // 800 * 0.45 = 360 → capped at 280

    act(() => {
      vvStub.height = 300; // simulate keyboard open
      vvResizeListeners.forEach((fn) => fn());
    });
    expect(result.current).toBe('160px');
  });

  it('resets to 280px when switching from mobile to desktop', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 200,
      configurable: true,
      writable: true,
    });
    const { result, rerender } = renderHook(({ m }) => useTerminalHeight(m), {
      initialProps: { m: true },
    });
    expect(result.current).toBe('160px');

    rerender({ m: false });
    expect(result.current).toBe('280px');
  });
});
