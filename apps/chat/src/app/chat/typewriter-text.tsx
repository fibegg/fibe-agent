import { useState, useEffect } from 'react';
import { useUiEffectsEnabled } from '../use-ui-effects';

export function TypewriterText({ text, speed = 40, pulseDelay = 3000 }: { text: string; speed?: number; pulseDelay?: number }) {
  const uiEffectsEnabled = useUiEffectsEnabled();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(uiEffectsEnabled ? 0 : text.length);
  }, [text, text.length, uiEffectsEnabled]);

  useEffect(() => {
    if (!uiEffectsEnabled) return;

    if (index < text.length) {
      const timeoutId = setTimeout(() => {
        setIndex((prev) => prev + 1);
      }, speed);
      return () => clearTimeout(timeoutId);
    } else {
      const pulseTimeoutId = setTimeout(() => {
        setIndex(0);
      }, pulseDelay);
      return () => clearTimeout(pulseTimeoutId);
    }
  }, [index, text.length, speed, pulseDelay, uiEffectsEnabled]);

  return uiEffectsEnabled ? text.substring(0, index) : text;
}
