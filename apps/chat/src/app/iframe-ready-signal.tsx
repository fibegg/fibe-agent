import { useEffect } from 'react';

let iframeReadyPosted = false;

function isEmbeddedFrame(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

export function IframeReadySignal() {
  useEffect(() => {
    if (iframeReadyPosted || !isEmbeddedFrame()) return;

    const frame = window.requestAnimationFrame(() => {
      if (iframeReadyPosted) return;

      iframeReadyPosted = true;
      window.parent.postMessage({ type: 'iframe_ready' }, '*');
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return null;
}

export function resetIframeReadySignalForTest() {
  iframeReadyPosted = false;
}
