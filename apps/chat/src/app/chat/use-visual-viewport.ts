import { useEffect } from 'react';

export const VIEWPORT_SETTLE_DELAYS_MS = [50, 150, 300, 600, 1000] as const;

/**
 * Sets CSS custom properties on `:root` for mobile keyboard awareness:
 *
 * - `--vh`: 1% of the *visual* viewport height (the portion visible above the
 *   soft keyboard). The app shell uses this for its full-height layout on iOS.
 *
 * - `--keyboard-height`: the height in pixels that the software keyboard
 *   currently occupies below the visual viewport
 *   (= `window.innerHeight - visualViewport.height - visualViewport.offsetTop`).
 *   Zero when no keyboard is shown. Kept as viewport telemetry for overlays,
 *   but the composer itself follows the visual viewport height.
 *
 * - `--visual-viewport-offset-top`: the visual viewport's top offset within
 *   the layout viewport. iOS/PWA can move the visual viewport while focusing
 *   an input, which otherwise leaves fixed app chrome slightly above the
 *   visible area.
 *
 * The layout follows the visual viewport instead of adding keyboard height to
 * the composer. That avoids double-counting on iOS PWAs where `100dvh` and
 * `visualViewport.height` already shrink while the keyboard is open.
 *
 * Usage:
 *   `height: var(--local-visual-height, 100dvh)` // full visual-viewport height
 */
export function useVisualViewport(): void {
  useEffect(() => {
    let frame: number | null = null;
    let timers: number[] = [];

    function update(): void {
      const vv = window.visualViewport;
      const vvHeight = vv?.height ?? window.innerHeight;
      const vvWidth = vv?.width ?? window.innerWidth;
      const vvOffsetTop = vv?.offsetTop ?? 0;
      const vvOffsetLeft = vv?.offsetLeft ?? 0;
      document.documentElement.style.setProperty('--vh', `${vvHeight * 0.01}px`);
      document.documentElement.style.setProperty('--local-visual-height', `${vvHeight}px`);
      document.documentElement.style.setProperty('--local-visual-width', `${vvWidth}px`);
      document.documentElement.style.setProperty('--visual-viewport-offset-top', `${vvOffsetTop}px`);
      document.documentElement.style.setProperty('--visual-viewport-offset-left', `${vvOffsetLeft}px`);
      const keyboardHeight = Math.max(0, window.innerHeight - vvHeight - vvOffsetTop);
      document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
    }

    function cancelScheduledUpdates(): void {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      for (const timer of timers) window.clearTimeout(timer);
      timers = [];
    }

    function scheduleUpdate(): void {
      cancelScheduledUpdates();
      update();
      frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
      timers = VIEWPORT_SETTLE_DELAYS_MS.map((delay) =>
        window.setTimeout(update, delay),
      );
    }

    scheduleUpdate();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', scheduleUpdate);
      vv.addEventListener('scroll', scheduleUpdate);
    } else {
      window.addEventListener('resize', scheduleUpdate);
    }
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('orientationchange', scheduleUpdate);
    window.addEventListener('pageshow', scheduleUpdate);
    document.addEventListener('focusin', scheduleUpdate, true);
    document.addEventListener('focusout', scheduleUpdate, true);
    document.addEventListener('visibilitychange', scheduleUpdate);

    return () => {
      cancelScheduledUpdates();
      const vv2 = window.visualViewport;
      if (vv2) {
        vv2.removeEventListener('resize', scheduleUpdate);
        vv2.removeEventListener('scroll', scheduleUpdate);
      } else {
        window.removeEventListener('resize', scheduleUpdate);
      }
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', scheduleUpdate);
      window.removeEventListener('pageshow', scheduleUpdate);
      document.removeEventListener('focusin', scheduleUpdate, true);
      document.removeEventListener('focusout', scheduleUpdate, true);
      document.removeEventListener('visibilitychange', scheduleUpdate);
    };
  }, []);
}
