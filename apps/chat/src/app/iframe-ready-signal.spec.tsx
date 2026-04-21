import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IframeReadySignal, resetIframeReadySignalForTest } from './iframe-ready-signal';

describe('IframeReadySignal', () => {
  const originalParent = window.parent;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  let animationFrameCallback: FrameRequestCallback | undefined;
  let parentWindow: Window;

  beforeEach(() => {
    resetIframeReadySignalForTest();
    animationFrameCallback = undefined;
    parentWindow = { postMessage: vi.fn() } as unknown as Window;

    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: parentWindow,
    });

    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallback = callback;
      return 1;
    });
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: originalParent,
    });
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    resetIframeReadySignalForTest();
  });

  it('posts iframe_ready after the React shell has mounted and yielded a frame', () => {
    render(<IframeReadySignal />);

    expect(parentWindow.postMessage).not.toHaveBeenCalled();

    act(() => {
      animationFrameCallback?.(performance.now());
    });

    expect(parentWindow.postMessage).toHaveBeenCalledWith({ type: 'iframe_ready' }, '*');
  });

  it('does not post more than once across remounts', () => {
    const first = render(<IframeReadySignal />);

    act(() => {
      animationFrameCallback?.(performance.now());
    });

    first.unmount();
    render(<IframeReadySignal />);

    expect(parentWindow.postMessage).toHaveBeenCalledTimes(1);
  });
});
