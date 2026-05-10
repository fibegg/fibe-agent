import { useEffect } from 'react';

/**
 * Sets a `--vh` CSS custom property on `:root` equal to `1vh` of the
 * *visual* viewport height (i.e., the portion visible when the soft keyboard
 * is not covering it).
 *
 * This is the standard workaround for iOS Safari where `100vh` measures the
 * *layout* viewport and doesn't shrink when the software keyboard appears.
 * Using `calc(var(--vh, 1vh) * 100)` in CSS provides a reliable full-height
 * value on all platforms.
 *
 * Usage in CSS / Tailwind inline style:
 *   `height: calc(var(--vh, 1vh) * 100)`
 *
 * Or just use this hook once at the top of your app — it handles the update
 * loop automatically.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    function update(): void {
      const height = window.visualViewport?.height ?? window.innerHeight;
      // Set 1vh = 1% of the *visual* viewport height
      document.documentElement.style.setProperty('--vh', `${height * 0.01}px`);
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
