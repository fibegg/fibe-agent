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
    document.documentElement.style.removeProperty('--keyboard-height');
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
    expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('0px');
  });

  it('sets --vh CSS variable using visualViewport.height when available', () => {
    const listeners: Record<string, EventListener> = {};
    const vv = {
      height: 600,
      addEventListener: vi.fn((type: string, fn: EventListener) => { listeners[type] = fn; }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });

    renderHook(() => useVisualViewport());

    expect(document.documentElement.style.getPropertyValue('--vh')).toBe('6px');
    expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('0px');
  });

  it('sets --keyboard-height when software keyboard is visible', () => {
    const vv = {
      height: 400,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    renderHook(() => useVisualViewport());

    // keyboard height = innerHeight - visualViewport.height = 800 - 400 = 400
    expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('400px');
    expect(document.documentElement.style.getPropertyValue('--vh')).toBe('4px');
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
