import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getThinkingLines } from './thinking-copy';
import { useAvatarConfig } from '../avatar-config-context';

const CYCLE_MS = 2400;

export function ThinkingState({ lastUserMessage }: { lastUserMessage?: string | null }) {
  const lines = getThinkingLines(lastUserMessage);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % lines.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [lines.length]);

  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="flex gap-1.5 shrink-0">
        <span
          className="size-2 rounded-full bg-violet-400 animate-thinking-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="size-2 rounded-full bg-violet-400 animate-thinking-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="size-2 rounded-full bg-violet-400 animate-thinking-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
      <span
        key={index}
        className="text-sm text-muted-foreground animate-thinking-fade"
      >
        {lines[index]}
      </span>
    </div>
  );
}

export function ThinkingAvatar() {
  const { assistantAvatarUrl } = useAvatarConfig();
  if (assistantAvatarUrl) {
    return (
      <div className="size-8 rounded-lg flex-shrink-0 overflow-hidden bg-muted">
        <img src={assistantAvatarUrl} alt="" className="size-full object-cover" />
      </div>
    );
  }
  return (
    <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center relative text-white flex-shrink-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-thinking-shine" />
      <Sparkles className="size-4 relative z-10 animate-thinking-pulse" />
    </div>
  );
}
