import { useEffect, useState } from 'react';
import { useUiEffectsEnabled } from '../use-ui-effects';

const DEFAULT_CHAR_MS = 24;

interface TypingTextProps {
  text: string;
  charMs?: number;
  className?: string;
  showCursor?: boolean;
  skipAnimation?: boolean;
}

export function TypingText({
  text,
  charMs = DEFAULT_CHAR_MS,
  className = '',
  showCursor = true,
  skipAnimation = false,
}: TypingTextProps) {
  const uiEffectsEnabled = useUiEffectsEnabled();
  const shouldSkipAnimation = skipAnimation || !uiEffectsEnabled;
  const [visibleLength, setVisibleLength] = useState(shouldSkipAnimation ? text.length : 0);

  useEffect(() => {
    setVisibleLength(shouldSkipAnimation ? text.length : 0);
  }, [text, shouldSkipAnimation]);

  useEffect(() => {
    if (shouldSkipAnimation || visibleLength >= text.length) return;
    const t = setTimeout(() => setVisibleLength((n) => n + 1), charMs);
    return () => clearTimeout(t);
  }, [shouldSkipAnimation, text.length, visibleLength, charMs]);

  const visible = text.slice(0, visibleLength);

  return (
    <span className={className}>
      {visible}
      {showCursor && uiEffectsEnabled && (
        <span
          className="inline-block w-2 h-4 ml-0.5 -mb-0.5 bg-violet-400 align-middle animate-typing-cursor"
          aria-hidden
        />
      )}
    </span>
  );
}
