import { RotateCw } from 'lucide-react';
import { CHAT_STATES } from './chat-state';
import { isRetryableError, truncateError } from './chat-state';

export interface ChatErrorBannerProps {
  errorMessage: string | null;
  state: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export function ChatErrorBanner({
  errorMessage,
  state,
  onRetry,
  onDismiss,
}: ChatErrorBannerProps) {
  if (!errorMessage || state !== CHAT_STATES.ERROR) return null;

  return (
    <div className="relative z-[1] flex shrink-0 items-center justify-between gap-2 px-4 py-2 bg-destructive/10 border-b border-border/50">
      <span
        className="text-destructive text-sm flex-1 min-w-0 break-words"
        title={errorMessage}
      >
        {truncateError(errorMessage)}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {isRetryableError(errorMessage) && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium bg-background/80 hover:bg-background border border-border text-foreground"
          >
            <RotateCw className="size-3.5" aria-hidden />
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
