import { useState, useEffect } from 'react';

export function TypewriterText({ text, speed = 40, pulseDelay = 3000 }: { text: string; speed?: number; pulseDelay?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [text]);

  useEffect(() => {
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
  }, [index, text.length, speed, pulseDelay]);

  return <>{text.substring(0, index)}</>;
}
