import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVisualViewport } from './use-visual-viewport';

describe('useVisualViewport', () => {
  let originalVisualViewport: VisualViewport | null;

  beforeEach(() => {
    originalVisualViewport = window.visualViewport;
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      value: originalVisualViewport,
      configurable: true,
      writable: true,
    });
    document.documentElement.style.removeProperty('--vh');
  });

  it('sets --vh CSS variable on mount using window.innerHeight fallback', () => {
    Object.defineProperty(window, 'visualViewport', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    renderHook(() => useVisualViewport());

    expect(document.documentElement.style.getPropertyValue('--vh')).toBe('8px');
  });

  it('sets --vh CSS variable using visualViewport.height when available', () => {
    const listeners: Record<string, EventListener> = {};
    const vv = {
      height: 600,
      addEventListener: vi.fn((type: string, fn: EventListener) => { listeners[type] = fn; }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });

    renderHook(() => useVisualViewport());

    expect(document.documentElement.style.getPropertyValue('--vh')).toBe('6px');
  });

  it('cleans up event listeners on unmount', () => {
    const vv = {
      height: 700,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });

    const { unmount } = renderHook(() => useVisualViewport());
    unmount();

    expect(vv.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(vv.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
