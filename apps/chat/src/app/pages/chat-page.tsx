import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthModal } from '../chat/auth-modal';
import { MessageList, type ChatMessage } from '../chat/message-list';
import { ModelSelector } from '../chat/model-selector';
import { ThemeToggle } from '../theme-toggle';
import { FileExplorer } from '../file-explorer/file-explorer';
import { SIDEBAR_WIDTH_PX } from '../layout-constants';
import { CHAT_STATES } from '../chat/chat-state';
import { useChatWebSocket } from '../chat/use-chat-websocket';
import { useVoiceRecorder } from '../chat/use-voice-recorder';
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
  const [pendingVoice, setPendingVoice] = useState<string | null>(null);
  const [pendingVoiceFilename, setPendingVoiceFilename] = useState<string | null>(null);
  const [voiceUploadError, setVoiceUploadError] = useState<string | null>(null);
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
      const role = data.role as string;
      setMessages((prev) => [
        ...prev,
        {
          id: payload.id,
          role,
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

  const voiceRecorder = useVoiceRecorder();

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
    const hasVoice = !!pendingVoiceFilename || !!pendingVoice;
    if ((!text && !pendingImages.length && !hasVoice) || state !== CHAT_STATES.AUTHENTICATED) return;
    send({
      action: 'send_chat_message',
      text: text ?? '',
      ...(pendingImages.length ? { images: pendingImages } : {}),
      ...(pendingVoiceFilename ? { audioFilename: pendingVoiceFilename } : pendingVoice ? { audio: pendingVoice } : {}),
    });
    if (input) input.value = '';
    setPendingImages([]);
    setPendingVoice(null);
    setPendingVoiceFilename(null);
  }, [send, state, pendingImages, pendingVoice, pendingVoiceFilename]);

  const addImage = useCallback((dataUrl: string) => {
    setPendingImages((prev) => (prev.length < MAX_PENDING_IMAGES ? [...prev, dataUrl] : prev));
  }, []);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removePendingVoice = useCallback(() => {
    setPendingVoice(null);
    setPendingVoiceFilename(null);
    setVoiceUploadError(null);
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

  const uploadVoiceFile = useCallback(async (blob: Blob): Promise<string | null> => {
    const base = getApiUrl();
    const url = base ? `${base}/api/uploads` : '/api/uploads';
    const token = getAuthTokenForRequest();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    const res = await fetch(url, { method: 'POST', headers, body: formData });
    if (!res.ok) return null;
    const data = (await res.json()) as { filename: string };
    return data.filename ?? null;
  }, []);

  const handleVoiceToggle = useCallback(async () => {
    const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
    if (voiceRecorder.isRecording) {
      const result = await voiceRecorder.stopRecording();
      if (result) {
        if (result.transcript && input) {
          const existing = input.value.trim();
          input.value = existing ? `${existing} ${result.transcript}` : result.transcript;
        }
        if (result.blob.size > 0) {
          const reader = new FileReader();
          reader.onloadend = () => setPendingVoice(reader.result as string);
          reader.readAsDataURL(result.blob);
          setVoiceUploadError(null);
          const filename = await uploadVoiceFile(result.blob);
          if (filename) {
            setPendingVoiceFilename(filename);
          } else {
            setVoiceUploadError('Upload failed; voice will be sent with message.');
          }
        }
      }
    } else {
      await voiceRecorder.startRecording();
    }
  }, [voiceRecorder, uploadVoiceFile]);

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
    !!(authModal.authUrl || authModal.deviceCode || authModal.isManualToken);

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] overflow-hidden bg-gradient-to-br from-background via-background to-violet-950/10 text-foreground">
      <AuthModal
        open={showAuthModal}
        authModal={authModal}
        onClose={cancelAuth}
        onSubmitCode={submitAuthCode}
      />
      <div className="min-h-0">
        <header className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-border/50 bg-card/40 backdrop-blur-xl flex-wrap gap-2">
          <div className="mb-2 sm:mb-3">
            <h1 className="font-semibold text-sm sm:text-base text-foreground">AI Assistant</h1>
            <p className={`text-[10px] sm:text-xs ${statusClass}`}>{STATE_LABELS[state] ?? state}</p>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <button
              type="button"
              className="size-7 sm:size-8 flex items-center justify-center rounded-lg text-violet-400 hover:text-violet-500 hover:bg-violet-500/10 transition-colors shrink-0"
              title="Search in conversation"
              aria-label="Search in conversation"
            >
              <SearchIcon className="size-3.5 sm:size-4" />
            </button>
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
                className="px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-600 text-white border-0 shadow-lg shadow-violet-500/30 hover:opacity-90 transition-opacity"
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
          <div className="flex items-center justify-between px-4 py-2 bg-destructive/10 border-b border-border/50">
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
      </div>

      <div
        className="grid min-h-0 overflow-hidden"
        style={{ gridTemplateColumns: `${SIDEBAR_WIDTH_PX}px 1fr` }}
      >
        <aside className="flex min-h-0 flex-col overflow-hidden">
          <FileExplorer />
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">
            <div className="max-w-4xl mx-auto">
              <MessageList
                messages={messages}
                streamingText={streamingText}
                isStreaming={state === CHAT_STATES.AWAITING_RESPONSE}
              />
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div className="shrink-0 p-3 sm:p-4 md:p-6 border-t border-border bg-card/30 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto flex flex-col gap-2">
              {(pendingImages.length > 0 || pendingVoice) && (
                <div className="flex flex-wrap gap-2 items-center">
                  {pendingVoice && (
                    <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-card/60">
                      <audio src={pendingVoice} controls className="max-h-10 min-w-[160px]" />
                      <button
                        type="button"
                        onClick={removePendingVoice}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white text-xs flex items-center justify-center hover:opacity-90"
                        aria-label="Remove voice"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {pendingImages.map((dataUrl, i) => (
                    <div key={i} className="relative inline-block">
                      <img
                        src={dataUrl}
                        alt=""
                        className="w-16 h-16 object-cover rounded-xl border border-border/50"
                      />
                      <button
                        type="button"
                        onClick={() => removePendingImage(i)}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white text-xs flex items-center justify-center hover:opacity-90"
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(voiceRecorder.error || voiceUploadError) && (
                <p className="text-destructive text-sm">{voiceRecorder.error ?? voiceUploadError}</p>
              )}
              <div className="flex items-end gap-2 sm:gap-3 bg-card rounded-2xl border border-border p-2 sm:p-3 shadow-xl shadow-violet-500/5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={state !== CHAT_STATES.AUTHENTICATED || pendingImages.length >= MAX_PENDING_IMAGES}
                  className="size-8 sm:size-9 rounded-lg flex items-center justify-center text-violet-400 hover:text-violet-500 hover:bg-violet-500/10 transition-colors shrink-0"
                  title="Attach image"
                  aria-label="Attach image"
                >
                  <PaperclipIcon className="size-3.5 sm:size-4" />
                </button>
                <textarea
                  id="chat-input"
                  className="flex-1 bg-transparent outline-none resize-none text-xs sm:text-sm py-2 min-h-[24px] max-h-32 text-foreground placeholder-muted-foreground disabled:opacity-50"
                  placeholder={
                    state === CHAT_STATES.AUTHENTICATED
                      ? 'Ask me anything... (paste or attach images)'
                      : 'Complete authentication to start chatting...'
                  }
                  rows={1}
                  disabled={state !== CHAT_STATES.AUTHENTICATED}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                />
                {voiceRecorder.isSupported && (
                  <button
                    type="button"
                    onClick={handleVoiceToggle}
                    disabled={state !== CHAT_STATES.AUTHENTICATED}
                    className={`size-8 sm:size-9 rounded-lg flex items-center justify-center transition-colors ${
                      voiceRecorder.isRecording
                        ? 'bg-destructive/90 hover:bg-destructive text-white'
                        : 'text-violet-400 hover:text-violet-500 hover:bg-violet-500/10'
                    }`}
                    title={voiceRecorder.isRecording ? 'Stop recording' : 'Voice input'}
                    aria-label={voiceRecorder.isRecording ? 'Stop recording' : 'Voice input'}
                  >
                    {voiceRecorder.isRecording ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span className="text-xs tabular-nums ml-1">
                          {Math.floor(voiceRecorder.recordingTimeSec / 60)}:{(voiceRecorder.recordingTimeSec % 60).toString().padStart(2, '0')}
                        </span>
                      </>
                    ) : (
                      <MicIcon className="size-3.5 sm:size-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={state !== CHAT_STATES.AUTHENTICATED}
                  className="size-8 sm:size-9 rounded-lg flex items-center justify-center bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white disabled:opacity-50 transition-opacity"
                  aria-label="Send"
                >
                  <SendIcon className="size-3.5 sm:size-4" />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v3m0 0v3m0-3h3m-3 0H9m3 0v-3m0 0V8a3 3 0 116 0v3z" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}
