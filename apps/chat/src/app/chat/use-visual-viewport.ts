import { useEffect } from 'react';

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
 *   `height: calc(var(--vh, 1svh) * 100)` // full visual-viewport height
 */
export function useVisualViewport(): void {
  useEffect(() => {
    function update(): void {
      const vv = window.visualViewport;
      const vvHeight = vv?.height ?? window.innerHeight;
      const vvOffsetTop = vv?.offsetTop ?? 0;
      // 1% of the visual viewport height (shrinks when keyboard is open)
      document.documentElement.style.setProperty('--vh', `${vvHeight * 0.01}px`);
      document.documentElement.style.setProperty('--visual-viewport-offset-top', `${vvOffsetTop}px`);
      // Height of the software keyboard (0 when closed)
      const keyboardHeight = Math.max(0, window.innerHeight - vvHeight - vvOffsetTop);
      document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
    }

    update();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    } else {
      window.addEventListener('resize', update);
    }

    return () => {
      const vv2 = window.visualViewport;
      if (vv2) {
        vv2.removeEventListener('resize', update);
        vv2.removeEventListener('scroll', update);
      } else {
        window.removeEventListener('resize', update);
      }
    };
  }, []);
}
