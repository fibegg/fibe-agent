import { useEffect, useState } from 'react';

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
  const [visibleLength, setVisibleLength] = useState(skipAnimation ? text.length : 0);

  useEffect(() => {
    setVisibleLength(skipAnimation ? text.length : 0);
  }, [text, skipAnimation]);

  useEffect(() => {
    if (skipAnimation || visibleLength >= text.length) return;
    const t = setTimeout(() => setVisibleLength((n) => n + 1), charMs);
    return () => clearTimeout(t);
  }, [skipAnimation, text.length, visibleLength, charMs]);

  const visible = text.slice(0, visibleLength);

  return (
    <span className={className}>
      {visible}
      {showCursor && (
        <span
          className="inline-block w-2 h-4 ml-0.5 -mb-0.5 bg-violet-400 align-middle animate-typing-cursor"
          aria-hidden
        />
      )}
    </span>
  );
}
