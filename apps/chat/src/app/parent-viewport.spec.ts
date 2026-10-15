import { beforeEach, describe, expect, it, vi } from 'vitest';

function messageFrom(source: unknown, data: unknown): MessageEvent {
  const event = new MessageEvent('message', { data });
  Object.defineProperty(event, 'source', { value: source });
  return event;
}

describe('parent viewport bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    document.documentElement.style.removeProperty('--parent-visual-height');
    document.documentElement.style.removeProperty('--parent-visual-width');
    document.documentElement.style.removeProperty('--parent-visual-offset-top');
    document.documentElement.style.removeProperty('--parent-visual-offset-left');
    document.documentElement.style.removeProperty('--parent-visual-frame-top');
    document.documentElement.style.removeProperty('--parent-visual-frame-left');
    document.documentElement.style.removeProperty('--parent-visual-page-top');
    document.documentElement.style.removeProperty('--parent-visual-page-left');
    for (const side of ['top', 'right', 'bottom', 'left']) {
      document.documentElement.style.removeProperty(`--parent-safe-${side}`);
    }
  });

  it('recognizes valid parent viewport messages', async () => {
    const { isParentViewportMessage } = await import('./parent-viewport');

    expect(isParentViewportMessage({ type: 'viewport', height: 640, width: 390, frameTop: 24 })).toBe(true);
    expect(isParentViewportMessage({ type: 'viewport', height: 0 })).toBe(false);
    expect(isParentViewportMessage({ type: 'viewport', height: Number.NaN })).toBe(false);
    expect(isParentViewportMessage({ type: 'viewport', height: 640, frameTop: -1 })).toBe(false);
    expect(isParentViewportMessage({ type: 'set_theme', height: 640 })).toBe(false);
  });

  it('applies parent viewport dimensions as root css variables', async () => {
    const { applyParentViewport } = await import('./parent-viewport');

    applyParentViewport({
      type: 'viewport',
      height: 612.5,
      width: 375,
      offsetTop: 12,
      offsetLeft: 2,
      frameTop: 96,
      frameLeft: 4,
      pageTop: 48,
      pageLeft: 6,
    });

    expect(document.documentElement.style.getPropertyValue('--parent-visual-height')).toBe('612.5px');
    expect(document.documentElement.style.getPropertyValue('--parent-visual-width')).toBe('375px');
    expect(document.documentElement.style.getPropertyValue('--parent-visual-offset-top')).toBe('12px');
    expect(document.documentElement.style.getPropertyValue('--parent-visual-offset-left')).toBe('2px');
    expect(document.documentElement.style.getPropertyValue('--parent-visual-frame-top')).toBe('96px');
    expect(document.documentElement.style.getPropertyValue('--parent-visual-frame-left')).toBe('4px');
    expect(document.documentElement.style.getPropertyValue('--parent-visual-page-top')).toBe('48px');
    expect(document.documentElement.style.getPropertyValue('--parent-visual-page-left')).toBe('6px');
  });

  it('listens for parent viewport messages only when embedded', async () => {
    const originalParent = window.parent;
    const fakeParent = {};
    Object.defineProperty(window, 'parent', { configurable: true, value: fakeParent });
    const { initParentViewport } = await import('./parent-viewport');

    initParentViewport();
    window.dispatchEvent(messageFrom(fakeParent, { type: 'viewport', height: 512 }));

    expect(document.documentElement.style.getPropertyValue('--parent-visual-height')).toBe('512px');

    Object.defineProperty(window, 'parent', { configurable: true, value: originalParent });
  });

  it('validates optional safe-area insets', async () => {
    const { isParentViewportMessage } = await import('./parent-viewport');
    const safe = { top: 47, right: 0, bottom: 34, left: 0 };

    expect(isParentViewportMessage({ type: 'viewport', height: 640, safeArea: safe })).toBe(true);
    expect(isParentViewportMessage({ type: 'viewport', height: 640, safeArea: { ...safe, top: 200 } })).toBe(true);
    expect(isParentViewportMessage({ type: 'viewport', height: 640, safeArea: { ...safe, top: 201 } })).toBe(false);
    expect(isParentViewportMessage({ type: 'viewport', height: 640, safeArea: { ...safe, bottom: -1 } })).toBe(false);
    expect(isParentViewportMessage({ type: 'viewport', height: 640, safeArea: { ...safe, left: Number.NaN } })).toBe(false);
    expect(isParentViewportMessage({ type: 'viewport', height: 640, safeArea: { ...safe, right: Infinity } })).toBe(false);
    expect(isParentViewportMessage({ type: 'viewport', height: 640, safeArea: { top: 1, right: 1, bottom: 1 } })).toBe(false);
    expect(isParentViewportMessage({ type: 'viewport', height: 640, safeArea: { ...safe, top: '47' } })).toBe(false);
    expect(isParentViewportMessage({ type: 'viewport', height: 640, safeArea: null })).toBe(false);
  });

  it('applies safe-area insets as root css variables', async () => {
    const { applyParentViewport } = await import('./parent-viewport');

    applyParentViewport({ type: 'viewport', height: 640, safeArea: { top: 47, right: 1.5, bottom: 34, left: 0 } });

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--parent-safe-top')).toBe('47px');
    expect(style.getPropertyValue('--parent-safe-right')).toBe('1.5px');
    expect(style.getPropertyValue('--parent-safe-bottom')).toBe('34px');
    expect(style.getPropertyValue('--parent-safe-left')).toBe('0px');
  });

  it('ignores viewport messages that do not come from the parent window', async () => {
    const originalParent = window.parent;
    const fakeParent = {};
    Object.defineProperty(window, 'parent', { configurable: true, value: fakeParent });
    const { initParentViewport } = await import('./parent-viewport');

    initParentViewport();
    window.dispatchEvent(messageFrom({}, { type: 'viewport', height: 333, safeArea: { top: 9, right: 0, bottom: 9, left: 0 } }));
    window.dispatchEvent(messageFrom(null, { type: 'viewport', height: 334 }));

    expect(document.documentElement.style.getPropertyValue('--parent-visual-height')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--parent-safe-top')).toBe('');

    window.dispatchEvent(messageFrom(fakeParent, { type: 'viewport', height: 512, safeArea: { top: 20, right: 0, bottom: 10, left: 0 } }));
    expect(document.documentElement.style.getPropertyValue('--parent-visual-height')).toBe('512px');
    expect(document.documentElement.style.getPropertyValue('--parent-safe-bottom')).toBe('10px');

    Object.defineProperty(window, 'parent', { configurable: true, value: originalParent });
  });
});
