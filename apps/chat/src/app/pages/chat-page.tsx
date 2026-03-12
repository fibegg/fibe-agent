import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Key,
  LogOut,
  Menu,
  Mic,
  Paperclip,
  Search,
  Send,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AuthModal } from '../chat/auth-modal';
import {
  FileMentionDropdown,
  getAtMentionState,
  valueAfterAtMatchesEntry,
} from '../chat/file-mention-dropdown';
import { MentionInput } from '../chat/mention-input';
import { MessageList, type ChatMessage } from '../chat/message-list';
import { ModelSelector } from '../chat/model-selector';
import { useChatWebSocket } from '../chat/use-chat-websocket';
import { usePlaygroundFiles } from '../chat/use-playground-files';
import { useVoiceRecorder } from '../chat/use-voice-recorder';
import { AnimatedPhoenixLogo } from '../animated-phoenix-logo';
import { FileExplorer } from '../file-explorer/file-explorer';
import { ThemeToggle } from '../theme-toggle';
import { CHAT_STATES } from '../chat/chat-state';
import type { ServerMessage } from '../chat/chat-state';
import { HeaderThinkingIcons } from '../chat/header-thinking-icons';
import {
  getApiUrl,
  getAuthTokenForRequest,
  isAuthenticated,
} from '../api-url';
import {
  getInitialSidebarCollapsed,
  persistSidebarCollapsed,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_WIDTH_PX,
} from '../layout-constants';

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
const MOBILE_BREAKPOINT_PX = 1024;

export function ChatPage() {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [lastSentMessage, setLastSentMessage] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingVoice, setPendingVoice] = useState<string | null>(null);
  const [pendingVoiceFilename, setPendingVoiceFilename] = useState<string | null>(null);
  const [voiceUploadError, setVoiceUploadError] = useState<string | null>(null);
  const [inputState, setInputState] = useState({ value: '', cursor: 0 });
  const inputValue = inputState.value;
  const cursorOffset = inputState.cursor;
  const modelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLDivElement>(null);
  const { entries: playgroundEntries } = usePlaygroundFiles();
  const atMention = getAtMentionState(inputValue, cursorOffset);
  const [mentionDropdownClosedAfterSelect, setMentionDropdownClosedAfterSelect] = useState(false);
  const mentionOpen =
    atMention.show &&
    !mentionDropdownClosedAfterSelect &&
    !valueAfterAtMatchesEntry(inputValue, playgroundEntries);
  useEffect(() => {
    if (!atMention.show) setMentionDropdownClosedAfterSelect(false);
  }, [atMention.show]);

  useEffect(() => persistSidebarCollapsed(sidebarCollapsed), [sidebarCollapsed]);

  useEffect(() => {
    if (isMobile) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobile]);

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
    const checkMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const closeMobileSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [messages, streamingText]);

  const handleMessage = useCallback((data: ServerMessage) => {
    if (data.type === 'message' && data.role && data.body !== undefined) {
      const payload = data as { id?: string; imageUrls?: string[] };
      const role = data.role as string;
      const body = data.body ?? '';
      const created_at = (data.created_at as string) ?? new Date().toISOString();
      const serverMsg = {
        id: payload.id,
        role,
        body,
        created_at,
        ...(payload.imageUrls?.length ? { imageUrls: payload.imageUrls } : {}),
      };
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'user' && last?.optimistic && last.body === body) {
          return [...prev.slice(0, -1), { ...serverMsg }];
        }
        return [...prev, serverMsg];
      });
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
      setLastSentMessage(null);
    }
  );

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    const hasVoice = !!pendingVoiceFilename || !!pendingVoice;
    if ((!text && !pendingImages.length && !hasVoice) || state !== CHAT_STATES.AUTHENTICATED) return;
    send({
      action: 'send_chat_message',
      text: text || '',
      ...(pendingImages.length ? { images: pendingImages } : {}),
      ...(pendingVoiceFilename ? { audioFilename: pendingVoiceFilename } : pendingVoice ? { audio: pendingVoice } : {}),
    });
    if (text) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', body: text, created_at: new Date().toISOString(), optimistic: true },
      ]);
    }
    setLastSentMessage(text || null);
    setInputState({ value: '', cursor: 0 });
    setPendingImages([]);
    setPendingVoice(null);
    setPendingVoiceFilename(null);
  }, [send, state, inputValue, pendingImages, pendingVoice, pendingVoiceFilename]);

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
        if (mentionOpen) return;
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, mentionOpen]
  );

  const handleMentionSelect = useCallback(
    (path: string) => {
      flushSync(() => setMentionDropdownClosedAfterSelect(true));
      const inserted = `@${path} `;
      const newVal =
        inputValue.slice(0, atMention.replaceStart) +
        inserted +
        inputValue.slice(cursorOffset);
      setInputState({ value: newVal, cursor: newVal.length });
      chatInputRef.current?.focus();
    },
    [inputValue, cursorOffset, atMention.replaceStart]
  );

  const handleMentionClose = useCallback(() => {
    const newVal =
      inputValue.slice(0, atMention.replaceStart) + inputValue.slice(cursorOffset);
    setInputState({ value: newVal, cursor: atMention.replaceStart });
    chatInputRef.current?.focus();
  }, [inputValue, cursorOffset, atMention.replaceStart]);

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
    if (voiceRecorder.isRecording) {
      const result = await voiceRecorder.stopRecording();
      if (result) {
        if (result.transcript) {
          setInputState((prev) => {
            const next = prev.value.trim() ? `${prev.value.trim()} ${result.transcript}` : (result.transcript ?? '');
            return { value: next, cursor: next.length };
          });
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

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

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

  const filteredMessages =
    searchQuery.trim() === ''
      ? messages
      : messages.filter((m) => m.body?.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  return (
    <div className="flex h-screen w-full min-h-0 overflow-hidden bg-gradient-to-br from-background via-background to-violet-950/10">
      <AuthModal
        open={showAuthModal}
        authModal={authModal}
        onClose={cancelAuth}
        onSubmitCode={submitAuthCode}
      />
      {settingsOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            aria-hidden
            onClick={closeSettings}
          />
          <div
            className="fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border shadow-card overflow-hidden"
            style={{ backgroundColor: 'var(--card)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
          >
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 id="settings-dialog-title" className="text-lg font-semibold text-foreground">
                Settings
              </h2>
              <button
                type="button"
                onClick={closeSettings}
                className="size-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-violet-500/10"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-foreground">Dark mode</span>
                <ThemeToggle />
              </div>
              {(state === CHAT_STATES.UNAUTHENTICATED || state === CHAT_STATES.AUTHENTICATED) && (
                <button
                  type="button"
                  onClick={() => {
                    closeSettings();
                    state === CHAT_STATES.UNAUTHENTICATED ? startAuth() : reauthenticate();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-violet-500/10 transition-colors"
                >
                  <Key className="size-4" />
                  {state === CHAT_STATES.UNAUTHENTICATED ? 'Start Auth' : 'Re-authenticate'}
                </button>
              )}
              {(state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE) && (
                <button
                  type="button"
                  onClick={() => {
                    closeSettings();
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 text-sm font-medium transition-colors"
                >
                  <LogOut className="size-4" />
                  Logout
                </button>
              )}
              <p className="text-xs text-muted-foreground pt-2">
                Phoenix Quantum Storage · v{__APP_VERSION__}
              </p>
            </div>
          </div>
        </>
      )}
      {isMobile && sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 lg:hidden"
            aria-hidden
            onClick={closeMobileSidebar}
          />
          <div className="fixed left-0 top-0 bottom-0 z-50 w-[85vw] sm:w-[400px] max-w-full flex flex-col bg-gradient-to-br from-background via-background to-violet-950/5 border border-violet-500/20 lg:hidden">
            <FileExplorer
              fullWidth
              onSettingsClick={() => setSettingsOpen(true)}
              onClose={closeMobileSidebar}
            />
          </div>
        </>
      )}
      {!isMobile && (
        <div
          className="relative flex min-h-0 flex-shrink-0 flex-col overflow-visible transition-[width] duration-300 ease-out"
          style={{ width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : SIDEBAR_WIDTH_PX }}
        >
          <aside className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <FileExplorer
              collapsed={sidebarCollapsed}
              onSettingsClick={() => setSettingsOpen(true)}
            />
          </aside>
          <div
            className="absolute top-0 right-0 bottom-0 w-px pointer-events-none z-0 bg-[var(--border-subtle)]"
            aria-hidden
          />
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={
              sidebarCollapsed
                ? 'Expand sidebar (⌘B)'
                : 'Collapse sidebar (⌘B)'
            }
            className="sidebar-toggle absolute top-1/2 right-0 z-10 flex h-14 w-7 -translate-y-1/2 translate-x-full items-center justify-center rounded-r-lg border-0 bg-card/80 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-violet-500/10 focus:outline-none focus:ring-2 focus:ring-violet-500/30 active:scale-95"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="size-4 text-violet-500 transition-transform" />
            ) : (
              <ChevronLeft className="size-4 text-violet-500 transition-transform" />
            )}
          </button>
        </div>
      )}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
        <header className="flex shrink-0 flex-col px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-border-subtle bg-card/40 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 shrink-0 lg:hidden">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-violet-600/90 to-purple-600/90 hover:from-violet-500 hover:to-purple-500 shadow-md shadow-violet-500/20 border border-violet-400/20 pl-1.5 pr-2.5 py-1.5 text-white transition-all active:scale-[0.98]"
                  aria-label="Open menu"
                >
                  <AnimatedPhoenixLogo className="size-7 sm:size-8 pointer-events-none" />
                  <Menu className="size-4 sm:size-5 shrink-0" />
                </button>
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-sm sm:text-base text-foreground truncate">AI Assistant</h2>
                {state === CHAT_STATES.AWAITING_RESPONSE ? (
                  <div className="flex items-center justify-start gap-1.5 mt-0.5">
                    <span className="text-[10px] sm:text-xs text-warning">Thinking...</span>
                    <HeaderThinkingIcons />
                  </div>
                ) : (
                  <p className={`text-[10px] sm:text-xs ${statusClass}`}>
                    {STATE_LABELS[state] ?? state}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => setShowSearch((v) => !v)}
                className="size-7 sm:size-8 flex items-center justify-center rounded-md text-violet-400 hover:text-violet-500 hover:bg-violet-500/10 transition-colors shrink-0"
                title="Search in conversation"
                aria-label="Search in conversation"
              >
                <Search className="size-3.5 sm:size-4" />
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
                  className="px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-medium bg-gradient-to-r from-violet-600 to-purple-600 text-white border-0 shadow-lg shadow-violet-500/30 hover:opacity-90 transition-opacity"
                >
                  {state === CHAT_STATES.UNAUTHENTICATED ? 'Start Auth' : 'Reauthenticate'}
                </button>
              )}
              {(state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE) && (
                <button
                  type="button"
                  onClick={logout}
                  className="px-3 py-1.5 rounded-md bg-destructive/90 hover:bg-destructive text-white text-[10px] sm:text-xs font-medium transition-colors"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: showSearch ? '1fr' : '0fr' }}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={`pb-2 pt-0.5 transition-opacity duration-200 ${showSearch ? 'opacity-100' : 'opacity-0'}`}
              >
                <div className="relative">
                  <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search in conversation..."
                    className="w-full h-8 sm:h-9 pl-8 sm:pl-10 pr-8 sm:pr-10 text-xs sm:text-sm rounded-md bg-input-bg border border-violet-500/30 dark:border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-500 dark:focus:border-primary focus:ring-2 focus:ring-violet-500/20 dark:focus:ring-primary/30"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="size-3.5 sm:size-4" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-2">
                    Found {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        </header>
        {errorMessage && state === CHAT_STATES.ERROR && (
          <div className="flex shrink-0 items-center justify-between px-4 py-2 bg-destructive/10 border-b border-border-subtle">
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
        <div className="chat-messages-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">
            <div className="max-w-4xl">
              <MessageList
                messages={filteredMessages}
                streamingText={streamingText}
                isStreaming={state === CHAT_STATES.AWAITING_RESPONSE}
                lastUserMessage={state === CHAT_STATES.AWAITING_RESPONSE ? lastSentMessage : null}
              />
              <div ref={messagesEndRef} />
            </div>
        </div>
        <div className="shrink-0 p-3 sm:p-4 md:p-6 border-t border-border bg-card/30 backdrop-blur-sm">
            <div className="max-w-4xl flex flex-col gap-2">
              {(pendingImages.length > 0 || pendingVoice) && (
                <div className="flex flex-wrap gap-2 items-center">
                  {pendingVoice && (
                    <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle bg-card/60">
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
                        className="w-16 h-16 object-cover rounded-xl border border-border-subtle"
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
                  className="size-8 sm:size-9 rounded-md flex items-center justify-center text-foreground dark:text-violet-400 hover:text-violet-600 hover:bg-violet-500/10 dark:hover:text-violet-500 transition-colors shrink-0"
                  title="Attach file"
                  aria-label="Attach file"
                >
                  <Paperclip className="size-3.5 sm:size-4" />
                </button>
                <div className="relative flex-1 min-w-0">
                  <MentionInput
                    inputRef={chatInputRef}
                    id="chat-input"
                    value={inputValue}
                    onChange={(v) => setInputState((prev) => ({ ...prev, value: v, cursor: v.length }))}
                    onValueAndCursor={(v, c) => setInputState({ value: v, cursor: c })}
                    onCursorChange={(c) => setInputState((prev) => ({ ...prev, cursor: c }))}
                    placeholder={
                      state === CHAT_STATES.AUTHENTICATED
                        ? 'Ask me anything... (type @ to link a file)'
                        : 'Complete authentication to start chatting...'
                    }
                    disabled={state !== CHAT_STATES.AUTHENTICATED}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    className="w-full bg-transparent"
                  />
                  <FileMentionDropdown
                    open={mentionOpen}
                    query={atMention.query}
                    entries={playgroundEntries}
                    anchorRef={chatInputRef}
                    onSelect={handleMentionSelect}
                    onClose={handleMentionClose}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={state !== CHAT_STATES.AUTHENTICATED || pendingImages.length >= MAX_PENDING_IMAGES}
                  className="size-8 sm:size-9 rounded-md flex items-center justify-center text-foreground dark:text-violet-400 hover:text-violet-600 hover:bg-violet-500/10 dark:hover:text-violet-500 transition-colors shrink-0"
                  title="Upload photo"
                  aria-label="Upload photo"
                >
                  <ImagePlus className="size-3.5 sm:size-4" />
                </button>
                {voiceRecorder.isSupported && (
                  <button
                    type="button"
                    onClick={handleVoiceToggle}
                    disabled={state !== CHAT_STATES.AUTHENTICATED}
                    className={`size-8 sm:size-9 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                      voiceRecorder.isRecording
                        ? 'bg-destructive/90 hover:bg-destructive text-white'
                        : 'text-foreground dark:text-violet-400 hover:text-violet-600 hover:bg-violet-500/10 dark:hover:text-violet-500'
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
                      <Mic className="size-3.5 sm:size-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={state !== CHAT_STATES.AUTHENTICATED}
                  className="size-8 sm:size-9 rounded-md flex items-center justify-center bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white disabled:opacity-50 transition-opacity"
                  aria-label="Send"
                >
                  <Send className="size-3.5 sm:size-4" />
                </button>
              </div>
            </div>
        </div>
      </main>
    </div>
  );
}

