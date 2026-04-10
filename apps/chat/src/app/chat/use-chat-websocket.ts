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
  WS_CLOSE,
  type ChatState,
  type ServerMessage,
  type StoredActivityEntry,
} from './chat-state';
import type { ThinkingStep } from './thinking-types';
import type { ToolOrFileEvent } from './thinking-types';

import { useChatAuth, type AuthModalState } from './use-chat-auth';

export interface UseChatWebSocketResult {
  state: ChatState;
  agentMode: string;
  errorMessage: string | null;
  authModal: AuthModalState;
  sessionActivity: StoredActivityEntry[];
  queuedCount: number;
  send: (msg: Record<string, unknown>) => void;
  reconnect: () => void;
  startAuth: () => void;
  reauthenticate: () => void;
  logout: () => void;
  cancelAuth: () => void;
  submitAuthCode: (code: string) => void;
  dismissError: () => void;
  interruptAgent: () => void;
  setState: React.Dispatch<React.SetStateAction<ChatState>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setAuthModal: React.Dispatch<React.SetStateAction<AuthModalState>>;
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
  onStreamEnd?: (usage?: { inputTokens: number; outputTokens: number }, model?: string) => void,
  thinkingCallbacks?: ThinkingCallbacks,
  onPlaygroundChanged?: () => void
): UseChatWebSocketResult {
  const navigate = useNavigate();
  const [state, setState] = useState<ChatState>(CHAT_STATES.INITIALIZING);
  const [agentMode, setAgentMode] = useState<string>('Exploring...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionActivity, setSessionActivity] = useState<StoredActivityEntry[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const onStreamChunkRef = useRef(onStreamChunk);
  const onStreamStartRef = useRef(onStreamStart);
  const onStreamEndRef = useRef(onStreamEnd);
  const thinkingRef = useRef(thinkingCallbacks);
  const onPlaygroundChangedRef = useRef(onPlaygroundChanged);
  thinkingRef.current = thinkingCallbacks;
  onMessageRef.current = onMessage;
  onStreamChunkRef.current = onStreamChunk;
  onStreamStartRef.current = onStreamStart;
  onStreamEndRef.current = onStreamEnd;
  onPlaygroundChangedRef.current = onPlaygroundChanged;

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

  const {
    authModal,
    setAuthModal,
    startAuth,
    reauthenticate,
    logout,
    cancelAuth,
    submitAuthCode,
  } = useChatAuth(send, setState);

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
      setErrorMessage(null);
      send({ action: 'get_model' });
    };

    const handlers: Record<string, (d: ServerMessage) => void> = {
      auth_status: (d) => {
        if (d.status === 'authenticated') {
          if (d.isProcessing) {
            setState(CHAT_STATES.AWAITING_RESPONSE);
            startResponseTimer();
          } else {
            setState((s) => (s !== CHAT_STATES.AWAITING_RESPONSE ? CHAT_STATES.AUTHENTICATED : s));
          }
        } else {
          setState((s) => (s !== CHAT_STATES.AUTH_PENDING ? CHAT_STATES.UNAUTHENTICATED : s));
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'initiate_auth' }));
          }
        }
      },
      auth_url_generated: (d) => {
        setAuthModal((a) => ({ ...a, authUrl: d.url ?? null, isManualToken: false }));
        setState(CHAT_STATES.AUTH_PENDING);
      },
      auth_device_code: (d) => setAuthModal((a) => ({ ...a, deviceCode: d.code ?? null, isManualToken: false })),
      auth_manual_token: () => {
        setAuthModal({ authUrl: null, deviceCode: null, isManualToken: true });
        setState(CHAT_STATES.AUTH_PENDING);
      },
      auth_success: () => {
        setAuthModal({ authUrl: null, deviceCode: null, isManualToken: false });
        setState(CHAT_STATES.AUTHENTICATED);
      },
      logout_success: () => setState(CHAT_STATES.UNAUTHENTICATED),
      error: (d) => {
        clearResponseTimer();
        setErrorMessage(d.message ?? 'An unexpected error occurred');
        setState(CHAT_STATES.ERROR);
        onStreamEndRef.current?.();
      },
      message: (d) => {
        clearResponseTimer();
        if (d.role === 'assistant') setState(CHAT_STATES.AUTHENTICATED);
        onMessageRef.current?.(d);
      },
      stream_start: (d) => {
        setState(CHAT_STATES.AWAITING_RESPONSE);
        startResponseTimer();
        onStreamStartRef.current?.({ model: d.model });
        thinkingRef.current?.onStreamStartData?.({ model: d.model });
      },
      stream_chunk: (d) => {
        const chunk = d.text ?? '';
        onStreamChunkRef.current?.(chunk);
      },
      stream_end: (d) => {
        clearResponseTimer();
        const usage =
          d.usage && typeof d.usage.inputTokens === 'number' && typeof d.usage.outputTokens === 'number'
            ? { inputTokens: d.usage.inputTokens, outputTokens: d.usage.outputTokens }
            : undefined;
        onStreamEndRef.current?.(usage, typeof d.model === 'string' ? d.model : undefined);
        setState(CHAT_STATES.AUTHENTICATED);
      },
      reasoning_start: () => thinkingRef.current?.onReasoningStart?.(),
      reasoning_chunk: (d) => thinkingRef.current?.onReasoningChunk?.(d.text ?? ''),
      reasoning_end: () => thinkingRef.current?.onReasoningEnd?.(),
      thinking_step: (d) => thinkingRef.current?.onThinkingStep?.({
        id: d.id ?? '',
        title: d.title ?? '',
        status: (d.status as ThinkingStep['status']) ?? 'pending',
        details: d.details,
        timestamp: d.timestamp ? new Date(d.timestamp) : new Date(),
      }),
      tool_call: (d) => thinkingRef.current?.onToolOrFile?.({
        kind: 'tool_call',
        name: d.name ?? '',
        path: d.path,
        summary: d.summary,
        command: d.command,
        details: d.details,
      }),
      file_created: (d) => thinkingRef.current?.onToolOrFile?.({
        kind: 'file_created',
        name: d.name ?? '',
        path: d.path,
        summary: d.summary,
      }),
      activity_snapshot: (d) => setSessionActivity(Array.isArray(d.activity) ? d.activity : []),
      activity_appended: (d) => { if (d.entry) setSessionActivity((prev) => [...prev, d.entry as StoredActivityEntry]) },
      activity_updated: (d) => {
        if (d.entry) {
          const updated = d.entry as StoredActivityEntry;
          setSessionActivity((prev) => prev.some((a) => a.id === updated.id) ? prev.map((a) => (a.id === updated.id ? updated : a)) : [...prev, updated]);
        }
      },
      model_updated: (d) => onMessageRef.current?.(d),
      playground_changed: () => onPlaygroundChangedRef.current?.(),
      queue_updated: (d) => setQueuedCount(typeof d.count === 'number' ? d.count : 0),
      agent_mode_updated: (d) => {
        if (d.mode) setAgentMode(d.mode);
      },
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as ServerMessage;
        handlers[data.type]?.(data);
      } catch {
        return;
      }
    };

    ws.onclose = (event: CloseEvent) => {
      if (event.code === WS_CLOSE.UNAUTHORIZED) {
        clearToken();
        navigate('/login', { replace: true });
        return;
      }
      if (event.code === WS_CLOSE.ANOTHER_SESSION_ACTIVE) {
        setErrorMessage('Another session is already active');
        setState(CHAT_STATES.ERROR);
        return;
      }
      if (event.code === WS_CLOSE.SESSION_TAKEN_OVER) {
        setErrorMessage('Your session was taken over by another client');
        setState(CHAT_STATES.ERROR);
        return;
      }
      setState(CHAT_STATES.AGENT_OFFLINE);
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
  }, [navigate, send, clearResponseTimer, startResponseTimer, setAuthModal]);

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

  const dismissError = useCallback(() => {
    setErrorMessage(null);
    setState(CHAT_STATES.AUTHENTICATED);
  }, []);

  const interruptAgent = useCallback(() => {
    send({ action: 'interrupt_agent' });
  }, [send]);

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
    agentMode,
    errorMessage,
    authModal,
    sessionActivity,
    queuedCount,
    send,
    reconnect,
    startAuth,
    reauthenticate,
    logout,
    cancelAuth,
    submitAuthCode,
    dismissError,
    interruptAgent,
    setState,
    setErrorMessage,
    setAuthModal,
  };
}
