import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthModal } from '../chat/auth-modal';
import { MessageList, type ChatMessage } from '../chat/message-list';
import { ModelSelector } from '../chat/model-selector';
import { ThemeToggle } from '../theme-toggle';
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
const MAX_PENDING_IMAGES = 5;

export function ChatPage() {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const modelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const payload = data as { id?: string; imageUrls?: string[] };
      setMessages((prev) => [
        ...prev,
        {
          id: payload.id,
          role: data.role,
          body: data.body ?? '',
          created_at: (data.created_at as string) ?? new Date().toISOString(),
          ...(payload.imageUrls?.length ? { imageUrls: payload.imageUrls } : {}),
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
    authModal,
    send,
    startAuth,
    cancelAuth,
    submitAuthCode,
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
    if ((!text && !pendingImages.length) || state !== CHAT_STATES.AUTHENTICATED) return;
    send({
      action: 'send_chat_message',
      text: text ?? '',
      ...(pendingImages.length ? { images: pendingImages } : {}),
    });
    if (input) input.value = '';
    setPendingImages([]);
  }, [send, state, pendingImages]);

  const addImage = useCallback((dataUrl: string) => {
    setPendingImages((prev) => (prev.length < MAX_PENDING_IMAGES ? [...prev, dataUrl] : prev));
  }, []);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;
      for (let i = 0; i < files.length && pendingImages.length < MAX_PENDING_IMAGES; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          if (dataUrl) addImage(dataUrl);
        };
        reader.readAsDataURL(file);
      }
      e.target.value = '';
    },
    [addImage, pendingImages.length]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      const item = items ? Array.from(items).find((it) => it.type.startsWith('image/')) : undefined;
      if (!item || pendingImages.length >= MAX_PENDING_IMAGES) return;
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (dataUrl) addImage(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [addImage, pendingImages.length]
  );

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
      ? 'text-success'
      : state === CHAT_STATES.ERROR
        ? 'text-destructive'
        : 'text-warning';

  const showModelSelector =
    state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE;

  const showAuthModal =
    state === CHAT_STATES.AUTH_PENDING &&
    (authModal.authUrl || authModal.deviceCode || authModal.isManualToken);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <AuthModal
        open={showAuthModal}
        authModal={authModal}
        onClose={cancelAuth}
        onSubmitCode={submitAuthCode}
      />
      <header className="flex items-center justify-between p-4 border-b border-border flex-wrap gap-2 shadow-soft">
        <div>
          <h1 className="text-lg font-semibold text-foreground">AI Assistant</h1>
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
              className="px-3 py-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium transition-opacity"
            >
              {state === CHAT_STATES.UNAUTHENTICATED ? 'Start Auth' : 'Reauthenticate'}
            </button>
          )}
          {(state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE) && (
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 rounded-lg bg-destructive/90 hover:bg-destructive text-white text-sm font-medium transition-colors"
            >
              Logout
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {errorMessage && state === CHAT_STATES.ERROR && (
        <div className="flex items-center justify-between px-4 py-2 bg-destructive/10 border-b border-border">
          <span className="text-destructive text-sm">{errorMessage}</span>
          <button
            type="button"
            onClick={dismissError}
            className="text-muted-foreground hover:text-foreground text-sm"
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

      <div className="p-4 border-t border-border bg-card/50">
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              {pendingImages.map((dataUrl, i) => (
                <div key={i} className="relative inline-block">
                  <img
                    src={dataUrl}
                    alt=""
                    className="w-16 h-16 object-cover rounded border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => removePendingImage(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center hover:opacity-90"
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <textarea
              id="chat-input"
              className="flex-1 min-h-[44px] max-h-32 px-3 py-2 rounded-lg bg-card border border-border text-foreground placeholder-muted-foreground resize-y disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
              placeholder={
                state === CHAT_STATES.AUTHENTICATED
                  ? 'Ask me anything... (paste or attach images)'
                  : 'Complete authentication to start chatting...'
              }
              rows={2}
              disabled={state !== CHAT_STATES.AUTHENTICATED}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={state !== CHAT_STATES.AUTHENTICATED || pendingImages.length >= MAX_PENDING_IMAGES}
              className="px-3 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50 self-end font-medium transition-colors"
              title="Attach image"
              aria-label="Attach image"
            >
              📷
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={state !== CHAT_STATES.AUTHENTICATED}
              className="px-4 rounded-lg bg-primary hover:opacity-90 text-primary-foreground disabled:opacity-50 self-end font-medium transition-opacity"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
