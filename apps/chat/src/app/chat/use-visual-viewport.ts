import { useEffect } from 'react';

/**
 * Sets CSS custom properties on `:root` for mobile keyboard awareness:
 *
 * - `--vh`: 1% of the *visual* viewport height (the portion visible above the
 *   soft keyboard). Used as a reliable full-height value on iOS Safari.
 *
 * - `--keyboard-height`: the height in pixels that the software keyboard
 *   currently occupies (= `window.innerHeight - visualViewport.height`).
 *   Zero when no keyboard is shown. Use this to push the chat input area
 *   above the keyboard without shrinking the whole layout.
 *
 * This is the Telegram / WhatsApp approach: the layout container stays at
 * the full window height (`100dvh`) and only the input area's bottom padding
 * grows by `--keyboard-height`, keeping it visually above the keyboard.
 *
 * Usage:
 *   `height: calc(var(--vh, 1svh) * 100)`   // full visual-viewport height
 *   `padding-bottom: var(--keyboard-height, 0px)` // input above keyboard
 */
export function useVisualViewport(): void {
  useEffect(() => {
    function update(): void {
      const vv = window.visualViewport;
      const vvHeight = vv?.height ?? window.innerHeight;
      // 1% of the visual viewport height (shrinks when keyboard is open)
      document.documentElement.style.setProperty('--vh', `${vvHeight * 0.01}px`);
      // Height of the software keyboard (0 when closed)
      const keyboardHeight = Math.max(0, window.innerHeight - vvHeight);
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
