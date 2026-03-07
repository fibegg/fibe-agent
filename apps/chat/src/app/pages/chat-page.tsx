import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageList, type ChatMessage } from '../chat/message-list';
import { ModelSelector } from '../chat/model-selector';
import { CHAT_STATES } from '../chat/chat-state';
import { useChatWebSocket } from '../chat/use-chat-websocket';
import type { ServerMessage } from '../chat/chat-state';
import {
  getApiUrl,
  getAuthTokenForRequest,
  isAuthenticated,
} from '../api-url';

const STATE_LABELS: Record<string, string> = {
  [CHAT_STATES.INITIALIZING]: 'Connecting...',
  [CHAT_STATES.AGENT_OFFLINE]: 'Agent offline',
  [CHAT_STATES.UNAUTHENTICATED]: 'Authentication required',
  [CHAT_STATES.AUTH_PENDING]: 'Authentication in progress...',
  [CHAT_STATES.AUTHENTICATED]: 'Ready to help',
  [CHAT_STATES.AWAITING_RESPONSE]: 'Working...',
  [CHAT_STATES.LOGGING_OUT]: 'Logging out...',
  [CHAT_STATES.ERROR]: 'Error occurred',
};

const MODEL_DEBOUNCE_MS = 500;

export function ChatPage() {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const modelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authenticated = isAuthenticated();
  useEffect(() => {
    if (!authenticated) {
      navigate('/login', { replace: true });
    }
  }, [authenticated, navigate]);

  const loadMessages = useCallback(async () => {
    const base = getApiUrl();
    const url = base ? `${base}/api/messages` : '/api/messages';
    const token = getAuthTokenForRequest();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(url, { headers });
      if (res.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      const data = (await res.json()) as ChatMessage[];
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setMessages([]);
    }
  }, [navigate]);

  const loadModelOptions = useCallback(async () => {
    const base = getApiUrl();
    const url = base ? `${base}/api/model-options` : '/api/model-options';
    const token = getAuthTokenForRequest();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(url, { headers });
      if (res.status === 401) return;
      const data = (await res.json()) as string[];
      setModelOptions(Array.isArray(data) ? data : []);
    } catch {
      setModelOptions([]);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadMessages();
      loadModelOptions();
    }
  }, [authenticated, loadMessages, loadModelOptions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleMessage = useCallback((data: ServerMessage) => {
    if (data.type === 'message' && data.role && data.body !== undefined) {
      setMessages((prev) => [
        ...prev,
        {
          id: (data as { id?: string }).id,
          role: data.role,
          body: data.body ?? '',
          created_at: (data.created_at as string) ?? new Date().toISOString(),
        },
      ]);
    }
    if (data.type === 'model_updated' && data.model !== undefined) {
      setCurrentModel(data.model);
    }
  }, []);

  const {
    state,
    errorMessage,
    send,
    startAuth,
    reauthenticate,
    logout,
    dismissError,
  } = useChatWebSocket(
    handleMessage,
    (chunk) => setStreamingText((prev) => prev + chunk),
    () => setStreamingText(''),
    (finalText) => {
      const text = finalText?.trim() || 'Process completed successfully but returned no output.';
      setMessages((m) => [
        ...m,
        { role: 'assistant', body: text, created_at: new Date().toISOString() },
      ]);
      setStreamingText('');
    }
  );

  const handleSend = useCallback(() => {
    const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
    const text = input?.value?.trim();
    if (!text || state !== CHAT_STATES.AUTHENTICATED) return;
    send({ action: 'send_chat_message', text });
    if (input) input.value = '';
  }, [send, state]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleModelSelect = useCallback(
    (model: string) => {
      setCurrentModel(model);
      send({ action: 'set_model', model });
    },
    [send]
  );

  const handleModelInputChange = useCallback(
    (value: string) => {
      setCurrentModel(value);
      if (modelDebounceRef.current) clearTimeout(modelDebounceRef.current);
      modelDebounceRef.current = setTimeout(() => {
        modelDebounceRef.current = null;
        send({ action: 'set_model', model: value.trim() });
      }, MODEL_DEBOUNCE_MS);
    },
    [send]
  );

  if (!authenticated) {
    return null;
  }

  const statusClass =
    state === CHAT_STATES.AUTHENTICATED
      ? 'text-green-400'
      : state === CHAT_STATES.ERROR
        ? 'text-red-400'
        : 'text-amber-400';

  const showModelSelector =
    state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE;

  return (
    <div className="min-h-screen flex flex-col bg-slate-800 text-slate-200">
      <header className="flex items-center justify-between p-4 border-b border-slate-700 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold">AI Assistant</h1>
          <p className={`text-sm ${statusClass}`}>{STATE_LABELS[state] ?? state}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ModelSelector
            currentModel={currentModel}
            options={modelOptions}
            onSelect={handleModelSelect}
            onInputChange={handleModelInputChange}
            visible={showModelSelector}
          />
          {(state === CHAT_STATES.UNAUTHENTICATED || state === CHAT_STATES.AUTHENTICATED) && (
            <button
              type="button"
              onClick={state === CHAT_STATES.UNAUTHENTICATED ? startAuth : reauthenticate}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm"
            >
              {state === CHAT_STATES.UNAUTHENTICATED ? 'Start Auth' : 'Reauthenticate'}
            </button>
          )}
          {(state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE) && (
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-sm"
            >
              Logout
            </button>
          )}
        </div>
      </header>

      {errorMessage && state === CHAT_STATES.ERROR && (
        <div className="flex items-center justify-between px-4 py-2 bg-red-900/30 border-b border-red-800">
          <span className="text-red-200 text-sm">{errorMessage}</span>
          <button
            type="button"
            onClick={dismissError}
            className="text-slate-400 hover:text-white text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto">
          <MessageList
            messages={messages}
            streamingText={streamingText}
            isStreaming={state === CHAT_STATES.AWAITING_RESPONSE}
          />
          <div ref={messagesEndRef} />
        </div>
      </main>

      <div className="p-4 border-t border-slate-700">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            id="chat-input"
            className="flex-1 min-h-[44px] max-h-32 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 placeholder-slate-400 resize-y disabled:opacity-50"
            placeholder={
              state === CHAT_STATES.AUTHENTICATED
                ? 'Ask me anything...'
                : 'Complete authentication to start chatting...'
            }
            rows={2}
            disabled={state !== CHAT_STATES.AUTHENTICATED}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={state !== CHAT_STATES.AUTHENTICATED}
            className="px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
