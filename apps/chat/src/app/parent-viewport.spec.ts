import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('parent viewport bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    document.documentElement.style.removeProperty('--parent-visual-height');
    document.documentElement.style.removeProperty('--parent-visual-width');
    document.documentElement.style.removeProperty('--parent-visual-offset-top');
    document.documentElement.style.removeProperty('--parent-visual-page-top');
  });

  it('recognizes valid parent viewport messages', async () => {
    const { isParentViewportMessage } = await import('./parent-viewport');

    expect(isParentViewportMessage({ type: 'viewport', height: 640, width: 390 })).toBe(true);
    expect(isParentViewportMessage({ type: 'viewport', height: 0 })).toBe(false);
    expect(isParentViewportMessage({ type: 'viewport', height: Number.NaN })).toBe(false);
    expect(isParentViewportMessage({ type: 'set_theme', height: 640 })).toBe(false);
  });

  it('applies parent viewport dimensions as root css variables', async () => {
    const { applyParentViewport } = await import('./parent-viewport');

    applyParentViewport({
      type: 'viewport',
      height: 612.5,
      width: 375,
      offsetTop: 12,
      pageTop: 48,
    });

    expect(document.documentElement.style.getPropertyValue('--parent-visual-height')).toBe('612.5px');
    expect(document.documentElement.style.getPropertyValue('--parent-visual-width')).toBe('375px');
    expect(document.documentElement.style.getPropertyValue('--parent-visual-offset-top')).toBe('12px');
    expect(document.documentElement.style.getPropertyValue('--parent-visual-page-top')).toBe('48px');
  });

  it('listens for parent viewport messages only when embedded', async () => {
    const originalParent = window.parent;
    Object.defineProperty(window, 'parent', { configurable: true, value: {} });
    const { initParentViewport } = await import('./parent-viewport');

    initParentViewport();
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'viewport', height: 512 },
    }));

    expect(document.documentElement.style.getPropertyValue('--parent-visual-height')).toBe('512px');

    Object.defineProperty(window, 'parent', { configurable: true, value: originalParent });
  });
});
