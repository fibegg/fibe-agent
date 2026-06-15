import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { VIEWPORT_SETTLE_DELAYS_MS, useVisualViewport } from './use-visual-viewport';

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
    document.documentElement.style.removeProperty('--local-visual-height');
    document.documentElement.style.removeProperty('--local-visual-width');
    document.documentElement.style.removeProperty('--keyboard-height');
    document.documentElement.style.removeProperty('--visual-viewport-offset-top');
    document.documentElement.style.removeProperty('--visual-viewport-offset-left');
    vi.useRealTimers();
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
    expect(document.documentElement.style.getPropertyValue('--local-visual-height')).toBe('800px');
    expect(document.documentElement.style.getPropertyValue('--local-visual-width')).toBe(`${window.innerWidth}px`);
    expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('0px');
  });

  it('sets --vh CSS variable using visualViewport.height when available', () => {
    const listeners: Record<string, EventListener> = {};
    const vv = {
      height: 600,
      width: 360,
      addEventListener: vi.fn((type: string, fn: EventListener) => { listeners[type] = fn; }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });

    renderHook(() => useVisualViewport());

    expect(document.documentElement.style.getPropertyValue('--vh')).toBe('6px');
    expect(document.documentElement.style.getPropertyValue('--local-visual-height')).toBe('600px');
    expect(document.documentElement.style.getPropertyValue('--local-visual-width')).toBe('360px');
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

  it('subtracts visualViewport.offsetTop from keyboard height', () => {
    const vv = {
      height: 400,
      offsetTop: 120,
      offsetLeft: 8,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    renderHook(() => useVisualViewport());

    expect(document.documentElement.style.getPropertyValue('--visual-viewport-offset-top')).toBe('120px');
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-offset-left')).toBe('8px');
    expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('280px');
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

  it('resamples after focus so first keyboard animation settle is captured', () => {
    vi.useFakeTimers();
    const vv = {
      height: 700,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });

    renderHook(() => useVisualViewport());
    expect(document.documentElement.style.getPropertyValue('--local-visual-height')).toBe('700px');

    document.dispatchEvent(new FocusEvent('focusin'));
    vv.height = 430;
    vi.advanceTimersByTime(VIEWPORT_SETTLE_DELAYS_MS[0]);

    expect(document.documentElement.style.getPropertyValue('--local-visual-height')).toBe('430px');
  });
});
