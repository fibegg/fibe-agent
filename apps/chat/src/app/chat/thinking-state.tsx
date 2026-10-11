import { Bot } from 'lucide-react';
import { getThinkingLineKeys } from './thinking-copy';
import { useAvatarConfig } from '../avatar-config-context';
import { useT } from '../i18n';

export function ThinkingState({
  lastUserMessage,
}: {
  lastUserMessage?: string | null;
}) {
  const t = useT();
  const lines = getThinkingLineKeys(lastUserMessage).map((key) => t(key));
  const line = lines[0] ?? t('chat.state.working');

  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="flex gap-1.5 shrink-0">
        <span
          className="size-2 rounded-full bg-primary animate-thinking-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="size-2 rounded-full bg-primary animate-thinking-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="size-2 rounded-full bg-primary animate-thinking-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
      <span className="text-sm text-muted-foreground">{line}</span>
    </div>
  );
}

export function ThinkingAvatar() {
  const { assistantAvatarUrl } = useAvatarConfig();
  if (assistantAvatarUrl) {
    return (
      <div className="size-8 rounded-lg flex-shrink-0 overflow-hidden bg-muted">
        <img
          src={assistantAvatarUrl}
          alt=""
          className="size-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className="size-8 rounded-lg flex items-center justify-center bg-muted text-foreground flex-shrink-0 overflow-hidden">
      <Bot className="size-4" />
    </div>
  );
}
