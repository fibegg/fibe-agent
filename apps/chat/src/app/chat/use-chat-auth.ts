import { useCallback, useState } from 'react';
import type { ChatState } from './chat-state';
import { CHAT_STATES } from './chat-state';

export interface AuthModalState {
  authUrl: string | null;
  deviceCode: string | null;
  isManualToken: boolean;
}

export function useChatAuth(
  send: (msg: Record<string, unknown>) => void,
  setState: React.Dispatch<React.SetStateAction<ChatState>>
) {
  const [authModal, setAuthModal] = useState<AuthModalState>({
    authUrl: null,
    deviceCode: null,
    isManualToken: false,
  });

  const startAuth = useCallback(() => {
    send({ action: 'initiate_auth' });
    setState(CHAT_STATES.AUTH_PENDING);
  }, [send, setState]);

  const reauthenticate = useCallback(() => {
    if (!window.confirm('This will clear your current authentication. Are you sure?')) return;
    send({ action: 'reauthenticate' });
    setState(CHAT_STATES.AUTH_PENDING);
  }, [send, setState]);

  const logout = useCallback(() => {
    if (!window.confirm('This will log you out completely. Are you sure?')) return;
    send({ action: 'logout' });
    setState(CHAT_STATES.LOGGING_OUT);
  }, [send, setState]);

  const cancelAuth = useCallback(() => {
    setAuthModal({ authUrl: null, deviceCode: null, isManualToken: false });
    send({ action: 'cancel_auth' });
    setState(CHAT_STATES.UNAUTHENTICATED);
  }, [send, setState]);

  const submitAuthCode = useCallback(
    (code: string) => {
      send({ action: 'submit_auth_code', code: code.trim() });
    },
    [send]
  );

  return {
    authModal,
    setAuthModal,
    startAuth,
    reauthenticate,
    logout,
    cancelAuth,
    submitAuthCode,
  };
}
