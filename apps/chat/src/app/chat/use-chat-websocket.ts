import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  clearToken,
  getAuthTokenForRequest,
  getWsUrl,
  isAuthenticated,
} from '../api-url';
import {
  CHAT_STATES,
  RESPONSE_TIMEOUT_MS,
  RECONNECT_INTERVAL_MS,
  type ChatState,
  type ServerMessage,
  type StoredActivityEntry,
} from './chat-state';
import type { ThinkingStep } from './thinking-types';
import type { ToolOrFileEvent } from './thinking-types';

export interface AuthModalState {
  authUrl: string | null;
  deviceCode: string | null;
  isManualToken: boolean;
}

export interface UseChatWebSocketResult {
  state: ChatState;
  errorMessage: string | null;
  authModal: AuthModalState;
  sessionActivity: StoredActivityEntry[];
  send: (msg: Record<string, unknown>) => void;
  reconnect: () => void;
  startAuth: () => void;
  reauthenticate: () => void;
  logout: () => void;
  cancelAuth: () => void;
  submitAuthCode: (code: string) => void;
  dismissError: () => void;
  setState: React.Dispatch<React.SetStateAction<ChatState>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setAuthModal: React.Dispatch<React.SetStateAction<AuthModalState>>;
}

function transition(
  setState: React.Dispatch<React.SetStateAction<ChatState>>,
  newState: ChatState
) {
  setState(newState);
}

export interface ThinkingCallbacks {
  onStreamStartData?: (data: { model?: string }) => void;
  onReasoningStart?: () => void;
  onReasoningChunk?: (text: string) => void;
  onReasoningEnd?: () => void;
  onThinkingStep?: (step: ThinkingStep) => void;
  onToolOrFile?: (event: ToolOrFileEvent) => void;
}

export function useChatWebSocket(
  onMessage?: (data: ServerMessage) => void,
  onStreamChunk?: (text: string) => void,
  onStreamStart?: (data?: { model?: string }) => void,
  onStreamEnd?: (finalText: string) => void,
  thinkingCallbacks?: ThinkingCallbacks
): UseChatWebSocketResult {
  const navigate = useNavigate();
  const [state, setState] = useState<ChatState>(CHAT_STATES.INITIALIZING);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authModal, setAuthModal] = useState<AuthModalState>({
    authUrl: null,
    deviceCode: null,
    isManualToken: false,
  });
  const [sessionActivity, setSessionActivity] = useState<StoredActivityEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const onStreamChunkRef = useRef(onStreamChunk);
  const onStreamStartRef = useRef(onStreamStart);
  const onStreamEndRef = useRef(onStreamEnd);
  const thinkingRef = useRef(thinkingCallbacks);
  thinkingRef.current = thinkingCallbacks;
  onMessageRef.current = onMessage;
  onStreamChunkRef.current = onStreamChunk;
  onStreamStartRef.current = onStreamStart;
  onStreamEndRef.current = onStreamEnd;
  const streamingAccumulatorRef = useRef('');

  const clearResponseTimer = useCallback(() => {
    if (responseTimerRef.current) {
      clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  }, []);

  const startResponseTimer = useCallback(() => {
    clearResponseTimer();
    responseTimerRef.current = setTimeout(() => {
      setErrorMessage('Response timed out. The AI took too long to respond.');
      setState(CHAT_STATES.ERROR);
    }, RESPONSE_TIMEOUT_MS);
  }, [clearResponseTimer]);

  const send = useCallback(
    (msg: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    []
  );

  const connect = useCallback(() => {
    if (!isAuthenticated()) {
      navigate('/login', { replace: true });
      return;
    }

    const token = getAuthTokenForRequest();
    const wsBase = getWsUrl();
    const url = token
      ? `${wsBase}/ws?token=${encodeURIComponent(token)}`
      : `${wsBase}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      send({ action: 'get_model' });
    };

    ws.onmessage = (event: MessageEvent) => {
      let data: ServerMessage;
      try {
        data = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }

      if (data.type === 'auth_status') {
        if (data.status === 'authenticated') {
          if (data.isProcessing) {
            transition(setState, CHAT_STATES.AWAITING_RESPONSE);
            startResponseTimer();
          } else {
            setState((s) => (s !== CHAT_STATES.AWAITING_RESPONSE ? CHAT_STATES.AUTHENTICATED : s));
          }
        } else {
          setState((s) => (s !== CHAT_STATES.AUTH_PENDING ? CHAT_STATES.UNAUTHENTICATED : s));
        }
        return;
      }

      if (data.type === 'auth_url_generated') {
        setAuthModal((a) => ({ ...a, authUrl: data.url ?? null, isManualToken: false }));
        transition(setState, CHAT_STATES.AUTH_PENDING);
        return;
      }

      if (data.type === 'auth_device_code') {
        setAuthModal((a) => ({ ...a, deviceCode: data.code ?? null, isManualToken: false }));
        return;
      }

      if (data.type === 'auth_manual_token') {
        setAuthModal({ authUrl: null, deviceCode: null, isManualToken: true });
        transition(setState, CHAT_STATES.AUTH_PENDING);
        return;
      }

      if (data.type === 'auth_success') {
        setAuthModal({ authUrl: null, deviceCode: null, isManualToken: false });
        transition(setState, CHAT_STATES.AUTHENTICATED);
        return;
      }

      if (data.type === 'logout_success') {
        transition(setState, CHAT_STATES.UNAUTHENTICATED);
        return;
      }

      if (data.type === 'error') {
        clearResponseTimer();
        setErrorMessage(data.message ?? 'An unexpected error occurred');
        transition(setState, CHAT_STATES.ERROR);
        onStreamEndRef.current?.('');
        return;
      }

      if (data.type === 'message') {
        clearResponseTimer();
        if (data.role === 'assistant') {
          setState(CHAT_STATES.AUTHENTICATED);
        }
        onMessageRef.current?.(data);
        return;
      }

      if (data.type === 'stream_start') {
        transition(setState, CHAT_STATES.AWAITING_RESPONSE);
        startResponseTimer();
        streamingAccumulatorRef.current = '';
        onStreamStartRef.current?.({ model: data.model });
        thinkingRef.current?.onStreamStartData?.({ model: data.model });
        return;
      }

      if (data.type === 'stream_chunk') {
        const chunk = data.text ?? '';
        streamingAccumulatorRef.current += chunk;
        onStreamChunkRef.current?.(chunk);
        return;
      }

      if (data.type === 'stream_end') {
        clearResponseTimer();
        const finalText = streamingAccumulatorRef.current;
        onStreamEndRef.current?.(finalText);
        streamingAccumulatorRef.current = '';
        transition(setState, CHAT_STATES.AUTHENTICATED);
        return;
      }

      if (data.type === 'reasoning_start') {
        thinkingRef.current?.onReasoningStart?.();
        return;
      }

      if (data.type === 'reasoning_chunk') {
        const text = data.text ?? '';
        thinkingRef.current?.onReasoningChunk?.(text);
        return;
      }

      if (data.type === 'reasoning_end') {
        thinkingRef.current?.onReasoningEnd?.();
        return;
      }

      if (data.type === 'thinking_step') {
        const step: ThinkingStep = {
          id: data.id ?? '',
          title: data.title ?? '',
          status: (data.status as ThinkingStep['status']) ?? 'pending',
          details: data.details,
          timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        };
        thinkingRef.current?.onThinkingStep?.(step);
        return;
      }

      if (data.type === 'tool_call') {
        const event: ToolOrFileEvent = {
          kind: 'tool_call',
          name: data.name ?? '',
          path: data.path,
          summary: data.summary,
          command: data.command,
        };
        thinkingRef.current?.onToolOrFile?.(event);
        return;
      }

      if (data.type === 'file_created') {
        const event: ToolOrFileEvent = {
          kind: 'file_created',
          name: data.name ?? '',
          path: data.path,
          summary: data.summary,
        };
        thinkingRef.current?.onToolOrFile?.(event);
        return;
      }

      if (data.type === 'activity_snapshot') {
        setSessionActivity(Array.isArray(data.activity) ? data.activity : []);
        return;
      }

      if (data.type === 'activity_appended' && data.entry) {
        setSessionActivity((prev) => [...prev, data.entry as StoredActivityEntry]);
        return;
      }

      if (data.type === 'model_updated') {
        onMessageRef.current?.(data);
        return;
      }
    };

    ws.onclose = (event: CloseEvent) => {
      if (event.code === 4001) {
        clearToken();
        navigate('/login', { replace: true });
        return;
      }
      if (event.code === 4000) {
        setErrorMessage('Another session is already active');
        transition(setState, CHAT_STATES.ERROR);
        return;
      }
      transition(setState, CHAT_STATES.AGENT_OFFLINE);
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, RECONNECT_INTERVAL_MS);
      }
    };

    ws.onerror = () => {
      /* ignore */
    };
  }, [navigate, send, clearResponseTimer, startResponseTimer]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      clearResponseTimer();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, clearResponseTimer]);

  const startAuth = useCallback(() => {
    send({ action: 'initiate_auth' });
    setState(CHAT_STATES.AUTH_PENDING);
  }, [send]);

  const reauthenticate = useCallback(() => {
    if (!window.confirm('This will clear your current authentication. Are you sure?')) return;
    send({ action: 'reauthenticate' });
    setState(CHAT_STATES.AUTH_PENDING);
  }, [send]);

  const logout = useCallback(() => {
    if (!window.confirm('This will log you out completely. Are you sure?')) return;
    send({ action: 'logout' });
    setState(CHAT_STATES.LOGGING_OUT);
  }, [send]);

  const cancelAuth = useCallback(() => {
    setAuthModal({ authUrl: null, deviceCode: null, isManualToken: false });
    send({ action: 'cancel_auth' });
    setState(CHAT_STATES.UNAUTHENTICATED);
  }, [send]);

  const submitAuthCode = useCallback(
    (code: string) => {
      send({ action: 'submit_auth_code', code: code.trim() });
    },
    [send]
  );

  const dismissError = useCallback(() => {
    setErrorMessage(null);
    setState(CHAT_STATES.AUTHENTICATED);
  }, []);

  const reconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    clearResponseTimer();
    wsRef.current?.close();
    wsRef.current = null;
    setErrorMessage(null);
    setState(CHAT_STATES.INITIALIZING);
    connect();
  }, [connect, clearResponseTimer]);

  return {
    state,
    errorMessage,
    authModal,
    sessionActivity,
    send,
    reconnect,
    startAuth,
    reauthenticate,
    logout,
    cancelAuth,
    submitAuthCode,
    dismissError,
    setState,
    setErrorMessage,
    setAuthModal,
  };
}
