import { useMemo } from 'react';
import { CHAT_STATES } from './chat-state';
import type { AuthModalState } from './use-chat-websocket';

export function useChatAuthUI(state: string, authModal: AuthModalState) {
  return useMemo(
    () => ({
      statusClass:
        state === CHAT_STATES.AUTHENTICATED
          ? 'text-muted-foreground'
          : state === CHAT_STATES.ERROR
            ? 'text-destructive'
            : 'text-warning',
      showModelSelector:
        state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE,
      showAuthModal:
        state === CHAT_STATES.AUTH_PENDING,
      authModalForModal: authModal,
    }),
    [state, authModal]
  );
}
