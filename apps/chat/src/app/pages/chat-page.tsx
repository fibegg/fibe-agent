import { ChevronDown, GitCompareArrows, Loader2, TerminalSquare } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthModal } from '../chat/auth-modal';
import { MessageList, type MessageListHandle, type ConversationResetSeparator, type ChatMessage } from '../chat/message-list';
import { WS_ACTION } from '@shared/ws-constants';
import { useChatWebSocket } from '../chat/use-chat-websocket';
import { useScrollToBottom } from '../chat/use-scroll-to-bottom';
import { usePlaygroundFiles } from '../chat/use-playground-files';
import { usePlaygroundSelector } from '../chat/use-playground-selector';
import { useAgentFiles } from '../chat/use-agent-files';
import { useChatLayout } from '../chat/use-chat-layout';
import { useVoiceRecorder } from '../chat/use-voice-recorder';
import { useLocalStt } from '../chat/use-local-stt';
import { useChatAttachments, MAX_PENDING_TOTAL } from '../chat/use-chat-attachments';
import { useChatActivityLog } from '../chat/use-chat-activity-log';
import { useChatInitialData } from '../chat/use-chat-initial-data';
import { useChatModel } from '../chat/use-chat-model';
import { useChatEffort } from '../chat/use-chat-effort';
import { useChatDisplayState } from '../chat/use-chat-display-state';
import { useChatInput } from '../chat/use-chat-input';
import { useChatAuthUI } from '../chat/use-chat-auth-ui';
import { useChatStreaming } from '../chat/use-chat-streaming';
import { FileExplorer, type PlaygroundEntry } from '../file-explorer/file-explorer';
import { API_PATHS } from '@shared/api-paths';
import type { FileTab } from '../file-explorer/file-explorer-tabs';
import { ChatLeftPanel } from './chat-left-panel';
import { ChatRightPanel } from './chat-right-panel';
import { CHAT_STATES, getChatInputPlaceholderWithT } from '../chat/chat-state';
import type { ServerMessage } from '../chat/chat-state';
import { apiRequest, isAuthenticated, isChatModelLocked } from '../api-url';
import { consumeGreeting } from '../postmessage-greeting';
import { isStandaloneMode } from '../embed-config';
import { ChatLayout } from './chat-layout';
import { AgentThinkingSidebar } from '../agent-thinking-sidebar';
import { usePanelResize } from '../use-panel-resize';
import {
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_WIDTH_PX,
  SIDEBAR_WIDTH_STORAGE_KEY,
  RIGHT_SIDEBAR_MIN_WIDTH_PX,
  RIGHT_SIDEBAR_MAX_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
} from '../layout-constants';

import { getActivityPath } from '../activity-path';
import { ChatSettingsModal } from '../chat/chat-settings-modal';
import { ChatHeader } from '../chat/chat-header';
import { ChatErrorBanner } from '../chat/chat-error-banner';
import { ChatInputArea } from '../chat/chat-input-area';
import { DragDropOverlay } from '../chat/drag-drop-overlay';
import { MODAL_OVERLAY_DARK, MOBILE_SHEET_PANEL } from '../ui-classes';
import { useTerminalPanel } from '../terminal/use-terminal-panel';
import { useDiffPanel } from '../diff/use-diff-panel';
import { RightDrawer } from '../right-drawer';
import { makeClientId } from '../browser-compat';
import {
  QuestionCard,
  ConfirmCard,
  ShowImageCard,
  NotifyToastContainer,
  type ToastItem,
} from '../chat/components/local-tool-cards';
import { CliDrawerContent } from '../chat/components/cli-drawer';
import { Command } from 'lucide-react';
import { useT } from '../i18n';

const LazyFileViewerPanel = lazy(() => import('../file-explorer/file-viewer-panel').then((m) => ({ default: m.FileViewerPanel })));
const LazyTerminalPanel = lazy(() => import('../terminal/terminal-panel').then((m) => ({ default: m.TerminalPanel })));
const LazyDiffPanel = lazy(() => import('../diff/diff-panel').then((m) => ({ default: m.DiffPanel })));

interface RuntimeConfigResponse {
  agentProviderLabel?: string | null;
  simplicate?: boolean;
}

const SIMPLICATE_STORAGE_KEY = 'simplicate-mode';

function readStoredSimplicateMode(): boolean | null {
  try {
    const value = localStorage.getItem(SIMPLICATE_STORAGE_KEY);
    if (value === null) return null;
    return value === 'true';
  } catch {
    return null;
  }
}

export function ChatPage() {
  const t = useT();
  const navigate = useNavigate();
  const sendRef = useRef<(payload: Record<string, unknown>) => void>(() => undefined);
  const handleSendRef = useRef<() => void>(() => undefined);

  const authenticated = isAuthenticated();
  const { messages, setMessages, messagesLoaded, modelOptions, refreshingModels, refreshModelOptions, agentProvider } = useChatInitialData(authenticated);

  const { entries: playgroundEntries, tree: playgroundTree, loading: playgroundLoading, stats: playgroundStats, refetch: refetchPlaygrounds } =
    usePlaygroundFiles();
  const { tree: agentFileTree, hasFiles: hasAgentFiles, stats: agentStats } =
    useAgentFiles();
  const hasPlaygroundFiles = playgroundEntries.length > 0;
  const hasAnyFiles = hasPlaygroundFiles || hasAgentFiles;
  const layout = useChatLayout(hasAnyFiles, playgroundLoading);
  const [activeFileTab, setActiveFileTab] = useState<FileTab>('playground');
  const {
    isMobile,
    sidebarOpen,
    setSidebarOpen,
    rightSidebarOpen,
    setRightSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    rightSidebarCollapsed,
    setRightSidebarCollapsed,
    settingsOpen,
    setSettingsOpen,
    searchQuery,
    setSearchQuery,
    closeMobileSidebar,
    closeSettings,
  } = layout;

  const [lastSentMessage, setLastSentMessage] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<PlaygroundEntry | null>(null);
  const [pageDirtyPaths, setPageDirtyPaths] = useState<Set<string>>(new Set());
  const { terminalOpen, toggleTerminal, closeTerminal } = useTerminalPanel();
  const { diffOpen, toggleDiff, closeDiff } = useDiffPanel();
  const [cliOpen, setCliOpen] = useState(false);
  const toggleCli = useCallback(() => setCliOpen(v => !v), []);
  const closeCli = useCallback(() => setCliOpen(false), []);
  const pgSelector = usePlaygroundSelector();
  const [standaloneMode, setStandaloneMode] = useState(() => isStandaloneMode());
  const [agentProviderLabel, setAgentProviderLabel] = useState('Claude');
  const [simplicateMode, setSimplicateMode] = useState(() => readStoredSimplicateMode() ?? false);
  const [compactFileBrowserOpen, setCompactFileBrowserOpen] = useState(false);
  const compactMode = simplicateMode;
  const canShowDiff = playgroundStats.hasGitRepo;

  // ─── Local MCP tool state ─────────────────────────────────────────────────

  type LocalToolItem =
    | { kind: 'ask'; questionId: string; question: string; placeholder?: string }
    | { kind: 'confirm'; questionId: string; message: string; confirmLabel?: string; cancelLabel?: string }
    | { kind: 'image'; key: string; url?: string; base64?: string; mimeType?: string; caption?: string };

  const [localToolItems, setLocalToolItems] = useState<LocalToolItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const handleLocalToolEvent = useCallback((data: ServerMessage) => {
    if (data.type === 'ask_user_prompt' && data.questionId && data.question) {
      setLocalToolItems((prev) => [
        ...prev,
        { kind: 'ask', questionId: data.questionId!, question: data.question!, placeholder: data.placeholder },
      ]);
    } else if (data.type === 'confirm_action_prompt' && data.questionId && data.message) {
      setLocalToolItems((prev) => [
        ...prev,
        {
          kind: 'confirm',
          questionId: data.questionId!,
          message: data.message!,
          confirmLabel: data.confirmLabel,
          cancelLabel: data.cancelLabel,
        },
      ]);
    } else if (data.type === 'show_image') {
      setLocalToolItems((prev) => [
        ...prev,
        {
          kind: 'image',
          key: makeClientId('local-tool-image'),
          url: data.url ?? undefined,
          base64: data.base64 ?? undefined,
          mimeType: data.mimeType,
          caption: data.caption,
        },
      ]);
    } else if (data.type === 'notify' && data.message) {
      setToasts((prev) => [
        ...prev,
        { id: makeClientId('toast'), message: data.message!, level: data.level ?? 'info' },
      ]);
    }
  }, []);

  const handleConversationReset = useCallback((resetAt: string) => {
    const separator: ConversationResetSeparator = { kind: 'reset_separator', resetAt };
    setMessages(() => [separator]);
    setTimeout(() => messageListRef.current?.scrollToBottom('auto'), 50);
  }, [setMessages]);

  const handleAnswerQuestion = useCallback((questionId: string, answer: string) => {
    sendRef.current({ action: 'answer_user_question', questionId, answer });
    setLocalToolItems((prev) => prev.filter((i) => !('questionId' in i) || i.questionId !== questionId));
  }, []);

  const handleConfirmQuestion = useCallback((questionId: string, confirmed: boolean) => {
    sendRef.current({ action: 'confirm_action_response', questionId, confirmed });
    setLocalToolItems((prev) => prev.filter((i) => !('questionId' in i) || i.questionId !== questionId));
  }, []);

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const [tonyStarkMode, setTonyStarkMode] = useState(() => localStorage.getItem('tony-stark-mode') === 'true');
  const handleToggleTonyStarkMode = useCallback(() => {
    setTonyStarkMode((prev) => {
      const next = !prev;
      localStorage.setItem('tony-stark-mode', String(next));
      return next;
    });
  }, []);

  const handleSimplicateModeChange = useCallback((enabled: boolean) => {
    setSimplicateMode(enabled);
    setCompactFileBrowserOpen(false);
    if (!enabled) {
      setSidebarOpen(false);
      setRightSidebarOpen(false);
    }
    try {
      localStorage.setItem(SIMPLICATE_STORAGE_KEY, String(enabled));
    } catch {
      // localStorage can be unavailable in restrictive embed contexts.
    }
  }, [setRightSidebarOpen, setSidebarOpen]);

  const openFileBrowser = useCallback(() => {
    if (isMobile) {
      setSidebarOpen(true);
      return;
    }
    setCompactFileBrowserOpen(true);
    setSidebarCollapsed(false);
  }, [isMobile, setSidebarCollapsed, setSidebarOpen]);

  const leftResize = usePanelResize({
    initialWidth: SIDEBAR_WIDTH_PX,
    minWidth: SIDEBAR_MIN_WIDTH_PX,
    maxWidth: SIDEBAR_MAX_WIDTH_PX,
    storageKey: SIDEBAR_WIDTH_STORAGE_KEY,
    side: 'left',
  });

  const rightResize = usePanelResize({
    initialWidth: RIGHT_SIDEBAR_WIDTH_PX,
    minWidth: RIGHT_SIDEBAR_MIN_WIDTH_PX,
    maxWidth: RIGHT_SIDEBAR_MAX_WIDTH_PX,
    storageKey: RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
    side: 'right',
  });

  const isPanelResizing = leftResize.isDragging || rightResize.isDragging;

  const handlePageDirtyChange = useCallback((path: string, isDirty: boolean) => {
    setPageDirtyPaths((prev) => {
      const next = new Set(prev);
      if (isDirty) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const { currentModel, setCurrentModel, handleModelSelect, handleModelInputChange } = useChatModel(sendRef);
  const { currentEffort, setCurrentEffort, handleEffortSelect } = useChatEffort(sendRef);

  useEffect(() => {
    setStandaloneMode(isStandaloneMode());
    if (!authenticated) return;

    let cancelled = false;
    apiRequest(API_PATHS.RUNTIME_CONFIG)
      .then((r) => (r.ok ? r.json() : null))
      .then((config: RuntimeConfigResponse | null) => {
        if (cancelled) return;
        setAgentProviderLabel(config?.agentProviderLabel?.trim() || 'Claude');
        if (readStoredSimplicateMode() === null) {
          setSimplicateMode(config?.simplicate === true);
        }
      })
      .catch(() => {
        if (!cancelled) setAgentProviderLabel('Claude');
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  useEffect(() => {
    if (!canShowDiff && diffOpen) {
      closeDiff();
    }
  }, [canShowDiff, diffOpen, closeDiff]);

  const {
    activityLog,
    activityLogRef,
    thinkingSteps,
    reasoningText,
    thinkingCallbacks,
    resetForNewStream,
  } = useChatActivityLog(refetchPlaygrounds);
  const {
    inputValue,
    setInputState,
    atMention,
    mentionOpen,
    chatInputRef,
    handleKeyDown,
    handleMentionSelect,
    handleMentionClose,
    focusInput,
  } = useChatInput({ playgroundEntries, onSendRef: handleSendRef });
  const messageListRef = useRef<MessageListHandle | null>(null);

  useEffect(() => {
    if (!authenticated) {
      navigate('/login', { replace: true });
    }
  }, [authenticated, navigate]);

  const handleMessage = useCallback((data: ServerMessage) => {
    if (data.type === 'message' && data.role && data.body !== undefined) {
      const payload = data as { id?: string; imageUrls?: string[]; model?: string };
      const role = data.role as string;
      const body = data.body ?? '';
      const created_at = (data.created_at as string) ?? new Date().toISOString();
      const serverMsg = {
        id: payload.id,
        role,
        body,
        created_at,
        ...(payload.imageUrls?.length ? { imageUrls: payload.imageUrls } : {}),
        ...(payload.model ? { model: payload.model } : {}),
      };
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const lastMsg = last && !('kind' in last) ? last as ChatMessage : null;
        if (lastMsg?.role === 'user' && lastMsg?.optimistic && lastMsg.body === body) {
          return [...prev.slice(0, -1), { ...serverMsg, ...(lastMsg.queued ? { queued: true } : {}) }];
        }
        return [...prev, serverMsg];
      });
    }
    if (data.type === 'model_updated' && data.model !== undefined) {
      setCurrentModel(data.model);
    }
    if (data.type === 'effort_updated' && data.effort !== undefined) {
      setCurrentEffort(data.effort);
    }
  }, [setCurrentEffort, setCurrentModel, setMessages]);

  const voiceRecorder = useVoiceRecorder();
  const localStt = useLocalStt();
  const voiceRecorderRef = useRef(voiceRecorder);
  useEffect(() => { voiceRecorderRef.current = voiceRecorder; });
  const localSttRef = useRef(localStt);
  useEffect(() => { localSttRef.current = localStt; });

  const onStreamEndCallback = useCallback(
    (finalText: string, usage?: { inputTokens: number; outputTokens: number }, model?: string, streamModel?: string | null) => {
      const text = finalText?.trim() || t('chat.noOutput');
      const log = activityLogRef.current;
      const storyForApi = log.map(({ id, type, message, timestamp, details, command, path }) => ({
        id,
        type,
        message,
        timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp),
        ...(details !== undefined ? { details } : {}),
        ...(command !== undefined ? { command } : {}),
        ...(path !== undefined ? { path } : {}),
      }));
      const modelForMessage = model ?? streamModel ?? undefined;
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          body: text,
          created_at: new Date().toISOString(),
          story: storyForApi,
          ...(usage ? { usage } : {}),
          ...(modelForMessage ? { model: modelForMessage } : {}),
        },
      ]);
      sendRef.current({ action: 'submit_story', story: storyForApi });
      setLastSentMessage(null);
      refetchPlaygrounds();
    },
    [setMessages, refetchPlaygrounds, activityLogRef, t]
  );

  const {
    streamingText,
    handleStreamStart,
    handleStreamChunk,
    handleStreamEnd,
  } = useChatStreaming({ onStreamEndCallback, resetForNewStream });

  const scroll = useScrollToBottom([messages, streamingText]);

  const {
    state,
    agentMode,
    errorMessage,
    authModal,
    sessionActivity,
    sessionCount,
    anyProcessing,
    send,
    reconnect,
    startAuth,
    cancelAuth,
    submitAuthCode,
    reauthenticate,
    logout,
    dismissError,
    interruptAgent,
  } = useChatWebSocket(
    handleMessage,
    handleStreamChunk,
    handleStreamStart,
    handleStreamEnd,
    thinkingCallbacks,
    refetchPlaygrounds,
    handleLocalToolEvent,
    handleConversationReset
  );

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    const notifyParent = () => {
      try {
        window.parent.postMessage({ type: 'agent_status_update', isWorking: state === CHAT_STATES.AWAITING_RESPONSE }, '*');
      } catch {
        // ignore across cross-origin if parent is unavailable
      }
    };
    notifyParent();
    const interval = setInterval(notifyParent, 1000);
    return () => clearInterval(interval);
  }, [state]);

  // Auto-send initial greeting when chat is authenticated with empty history
  const greetingSentRef = useRef(false);
  useEffect(() => {
    if (greetingSentRef.current) return;
    if (state !== CHAT_STATES.AUTHENTICATED) return;
    if (!messagesLoaded) return; // Wait for history fetch to complete
    if (messages.length > 0) return; // Has existing conversation

    const greeting = consumeGreeting();
    if (!greeting) return;

    greetingSentRef.current = true;
    send({ action: 'send_chat_message', text: greeting });
    setMessages((prev) => [
      ...prev,
      { role: 'user', body: greeting, created_at: new Date().toISOString(), optimistic: true },
    ]);
    scroll.markJustSent();
  }, [state, messagesLoaded, messages, send, setMessages, scroll]);

  const {
    pendingImages,
    pendingAttachments,
    pendingVoice,
    pendingVoiceFilename,
    voiceUploadError,
    attachmentUploadError,
    removePendingImage,
    removePendingVoice,
    removePendingAttachment,
    handleFileChange,
    clearPending,
    isDragOver,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handlePaste,
  } = useChatAttachments({ isAuthenticated: state === CHAT_STATES.AUTHENTICATED });

  const {
    filteredMessages,
    lastUserMessage,
    displayStory,
    pastActivityFromMessages,
    sessionTimeMs,
    mobileSessionStats,
    mobileBrainClasses,
    sessionTokenUsage,
  } = useChatDisplayState({
    messages,
    searchQuery,
    state,
    activityLog,
    sessionActivity,
    lastSentMessage,
  });


  /**
   * Stops the active voice recording and resolves the final transcript.
   * Falls back to the local STT worker when Web Speech returns no text.
   * Extracted to avoid duplicating the stop→transcribe→fallback flow in
   * both handleSend and handleVoiceToggle.
   */
  const stopAndTranscribe = useCallback(async (): Promise<string> => {
    // Capture liveText BEFORE stopping — final Web Speech onresult may arrive after onstop resolves
    const liveTextSnapshot = voiceRecorderRef.current.liveText;
    const result = await voiceRecorderRef.current.stopRecording();
    if (!result) return '';
    let transcript = result.transcript || liveTextSnapshot || '';
    if (!transcript && result.blob.size > 0) {
      transcript = await localSttRef.current.transcribe(result.blob).catch((err: unknown) => {
        console.error('Local STT Error:', err);
        return '';
      });
    }
    return transcript;
  }, []);

  const handleSend = useCallback(async () => {
    let currentInput = inputValue.trim();
    const isQueuing = state === CHAT_STATES.AWAITING_RESPONSE;
    const currentPendingImages = [...pendingImages];
    const currentPendingVoiceFilename = pendingVoiceFilename;
    const currentPendingVoice = pendingVoice;
    const currentPendingAttachments = [...pendingAttachments];

    if (voiceRecorderRef.current.isRecording) {
      const transcript = await stopAndTranscribe();
      if (transcript) {
        currentInput = currentInput ? `${currentInput} ${transcript}` : transcript;
      }
    }

    const hasVoice = !!currentPendingVoiceFilename || !!currentPendingVoice;
    const hasContent = currentInput || currentPendingImages.length > 0 || hasVoice || currentPendingAttachments.length > 0;

    if (!hasContent) return;
    if (!isQueuing && state !== CHAT_STATES.AUTHENTICATED) return;

    if (isQueuing) {
      // Queue mode — text only
      if (!currentInput) return;
      send({ action: 'queue_message', text: currentInput });
    } else {
      send({
        action: 'send_chat_message',
        text: currentInput || '',
        ...(currentPendingImages.length ? { images: currentPendingImages.map(img => img.filename) } : {}),
        ...(currentPendingVoiceFilename ? { audioFilename: currentPendingVoiceFilename } : currentPendingVoice ? { audio: currentPendingVoice } : {}),
        ...(currentPendingAttachments.length ? { attachmentFilenames: currentPendingAttachments.map((a) => a.filename) } : {}),
      });
    }

    try {
      window.parent.postMessage({ type: 'player_message_sent' }, '*');
    } catch {
      // ignore across cross-origin if parent is unavailable
    }

    if (currentInput) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', body: currentInput, created_at: new Date().toISOString(), optimistic: true, ...(isQueuing ? { queued: true } : {}) },
      ]);
    }
    setLastSentMessage(currentInput || null);
    setInputState({ value: '', cursor: 0 });
    if (!isQueuing) clearPending();
    scroll.markJustSent();
    focusInput({ persistent: true });
  }, [
    send, state, inputValue, pendingImages, pendingVoice, pendingVoiceFilename, pendingAttachments, scroll,
    clearPending, focusInput, setInputState, setMessages, stopAndTranscribe,
  ]);

  const handleSendContinue = useCallback(() => {
    send({
      action: 'send_chat_message',
      text: t('chat.continue'),
    });
    setMessages((prev) => [
      ...prev,
      { role: 'user', body: t('chat.continue'), created_at: new Date().toISOString(), optimistic: true },
    ]);
    setLastSentMessage(t('chat.continue'));
    scroll.markJustSent();
  }, [send, scroll, setMessages, t]);

  const handleRetryFromError = useCallback(() => {
    dismissError();
    handleSendContinue();
  }, [dismissError, handleSendContinue]);

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // Clear queued badges when streaming stops (e.g. session interrupted and restarted)
  useEffect(() => {
    if (state !== CHAT_STATES.AWAITING_RESPONSE) {
      setMessages((prev) => {
        if (!prev.some((m) => !('kind' in m) && m.queued)) return prev;
        return prev.map((m) => (!('kind' in m) && m.queued ? { ...m, queued: false } : m));
      });
    }
  }, [state, setMessages]);

  const handleVoiceToggle = useCallback(async () => {
    if (voiceRecorderRef.current.isRecording || localSttRef.current.isTranscribing) {
      if (voiceRecorderRef.current.isRecording) {
        const transcript = await stopAndTranscribe();
        if (transcript) {
          setInputState((prev) => ({
            ...prev,
            value: prev.value ? `${prev.value} ${transcript}` : transcript,
          }));
        }
      }
    } else {
      await voiceRecorderRef.current.startRecording();
    }
  }, [setInputState, stopAndTranscribe]);

  const { statusClass, showModelSelector, showAuthModal, authModalForModal } = useChatAuthUI(
    state,
    authModal
  );
  const chatModelLocked = isChatModelLocked();

  const openSettings = useCallback(() => {
    if (isMobile) {
      closeMobileSidebar();
      setRightSidebarOpen(false);
    }
    setSettingsOpen(true);
  }, [isMobile, closeMobileSidebar, setRightSidebarOpen, setSettingsOpen]);

  if (!authenticated) {
    return null;
  }

  return (
    <ChatLayout
      isDragOver={isDragOver}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      isPanelResizing={isPanelResizing}
      dragOverlay={<DragDropOverlay />}
      modals={
        <>
          <AuthModal
            open={showAuthModal}
            authModal={authModalForModal}
            onClose={cancelAuth}
            onSubmitCode={(code) => {
              if (state === CHAT_STATES.UNAUTHENTICATED) send({ action: 'initiate_auth' });
              submitAuthCode(code);
            }}
          />
          <ChatSettingsModal
            open={settingsOpen}
            onClose={closeSettings}
            state={state}
            isStandalone={standaloneMode}
            onStartAuth={startAuth}
            onReauthenticate={reauthenticate}
            onLogout={logout}
            simplicateMode={simplicateMode}
            onSimplicateModeChange={handleSimplicateModeChange}
            onResetConversation={
              !anyProcessing
                ? () => send({ action: WS_ACTION.RESET_CONVERSATION })
                : undefined
            }
          />
        </>
      }
      mobileSidebar={
        isMobile && sidebarOpen ? (
          <>
            <div
              className={`${MODAL_OVERLAY_DARK} lg:hidden`}
              aria-hidden
              onClick={closeMobileSidebar}
            />
            <div className={`${MOBILE_SHEET_PANEL} left-0 bg-gradient-to-br from-background via-background to-violet-950/5 border border-violet-500/20`}>
              <FileExplorer
                tree={playgroundTree}
                agentTree={agentFileTree as PlaygroundEntry[]}
                activeTab={activeFileTab}
                onTabChange={setActiveFileTab}
                agentFileApiPath="agent-files/file"
                playgroundStats={playgroundStats}
                agentStats={agentStats}
                onSettingsClick={openSettings}
                onClose={closeMobileSidebar}
                onFileSelect={(entry) => {
                  setViewingFile(entry);
                  closeMobileSidebar();
                }}
                selectedPath={viewingFile?.path ?? null}
                dirtyPaths={pageDirtyPaths}
                onPlaygroundUploaded={refetchPlaygrounds}
                onAgentUploaded={refetchPlaygrounds}
                agentProviderLabel={agentProviderLabel}
                currentModel={currentModel}
              />
            </div>
          </>
        ) : null
      }
      mobileActivity={
        isMobile ? (
          <RightDrawer
            open={rightSidebarOpen}
            onClose={() => setRightSidebarOpen(false)}
            title={t('activity.activity')}
          >
            <AgentThinkingSidebar
              isCollapsed={false}
              onToggle={() => setRightSidebarOpen(false)}
              isStreaming={state === CHAT_STATES.AWAITING_RESPONSE}
              reasoningText={reasoningText}
              streamingResponseText={streamingText}
              thinkingSteps={thinkingSteps}
              storyItems={displayStory}
              sessionActivity={sessionActivity}
              pastActivityFromMessages={pastActivityFromMessages}
              sessionTokenUsage={sessionTokenUsage}
              mobileOverlay
              onActivityClick={(payload) => navigate(getActivityPath(payload))}
            />
          </RightDrawer>
        ) : null
      }
      leftPanel={
        !isMobile && (!compactMode || compactFileBrowserOpen) ? (
          <ChatLeftPanel
            hasAnyFiles={hasAnyFiles}
            sidebarCollapsed={compactMode ? false : sidebarCollapsed}
            width={leftResize.width}
            isDraggingResize={leftResize.isDragging}
            panelRef={leftResize.panelRef}
            playgroundTree={playgroundTree}
            agentFileTree={agentFileTree as PlaygroundEntry[]}
            activeFileTab={activeFileTab}
            onTabChange={setActiveFileTab}
            playgroundStats={playgroundStats}
            agentStats={agentStats}
            onSettingsClick={openSettings}
            onToggleCollapse={() => {
              if (compactMode) {
                setCompactFileBrowserOpen(false);
                return;
              }
              setSidebarCollapsed((v) => !v);
            }}
            onFileSelect={(entry) => setViewingFile(entry)}
            onResizeStart={leftResize.startResize}
            selectedPath={viewingFile?.path ?? null}
            dirtyPaths={pageDirtyPaths}
            onPlaygroundUploaded={refetchPlaygrounds}
            onAgentUploaded={refetchPlaygrounds}
            agentProviderLabel={agentProviderLabel}
            currentModel={currentModel}
          />
        ) : null
      }
      rightPanel={
        !isMobile ? (
          <ChatRightPanel
            rightSidebarCollapsed={rightSidebarCollapsed}
            onToggle={() => setRightSidebarCollapsed((v) => !v)}
            isStreaming={state === CHAT_STATES.AWAITING_RESPONSE}
            reasoningText={reasoningText}
            streamingResponseText={streamingText}
            thinkingSteps={thinkingSteps}
            storyItems={displayStory}
            sessionActivity={sessionActivity}
            pastActivityFromMessages={pastActivityFromMessages}
            sessionTokenUsage={sessionTokenUsage}
            width={rightResize.width}
            isDraggingResize={rightResize.isDragging}
            panelRef={rightResize.panelRef}
            onResizeStart={rightResize.startResize}
          />
        ) : null
      }
    >
      <div className="relative flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">
        <ChatHeader
          isMobile={isMobile}
          agentProvider={agentProvider}
          agentProviderLabel={agentProviderLabel}
          currentModel={currentModel}
          state={state}
          agentMode={agentMode}
          errorMessage={errorMessage}
          sessionTimeMs={sessionTimeMs}
          mobileSessionStats={mobileSessionStats}
          sessionTokenUsage={sessionTokenUsage}
          mobileBrainClasses={mobileBrainClasses}
          statusClass={statusClass}
          searchQuery={searchQuery}
          filteredMessagesCount={filteredMessages.length}
          onSearchChange={setSearchQuery}
          onReconnect={reconnect}
          onStartAuth={startAuth}
          onOpenMenu={compactMode ? openSettings : () => setSidebarOpen(true)}
          onOpenActivity={() => setRightSidebarOpen(true)}
          onToggleTerminal={toggleTerminal}
          terminalOpen={terminalOpen}
          onToggleDiff={canShowDiff ? toggleDiff : undefined}
          diffOpen={diffOpen}
          onToggleCli={toggleCli}
          cliOpen={cliOpen}
          currentEffort={currentEffort}
          onEffortSelect={handleEffortSelect}
          showModelSelector={showModelSelector}
          modelOptions={modelOptions}
          onModelSelect={handleModelSelect}
          onModelInputChange={handleModelInputChange}
          modelLocked={chatModelLocked}
          onRefreshModels={refreshModelOptions}
          refreshingModels={refreshingModels}
          playgroundEntries={pgSelector.entries}
          playgroundLoading={pgSelector.loading}
          playgroundError={pgSelector.error}
          playgroundCurrentLink={pgSelector.currentLink}
          playgroundLinking={pgSelector.linking}
          playgroundCanGoBack={pgSelector.canGoBack}
          playgroundBreadcrumbs={pgSelector.breadcrumbs}
          onPlaygroundOpen={pgSelector.open}
          onPlaygroundBrowse={pgSelector.browseTo}
          onPlaygroundGoBack={pgSelector.goBack}
          onPlaygroundGoToRoot={pgSelector.goToRoot}
          onPlaygroundLink={pgSelector.linkPlayground}
          onPlaygroundLinked={refetchPlaygrounds}
          onPlaygroundSmartMount={pgSelector.smartMount}
          tonyStarkMode={tonyStarkMode}
          onToggleTonyStarkMode={handleToggleTonyStarkMode}
          simplicateMode={simplicateMode}
          onSimplicateModeChange={handleSimplicateModeChange}
          onOpenFileBrowser={openFileBrowser}
          onResetConversation={
            !anyProcessing
              ? () => send({ action: WS_ACTION.RESET_CONVERSATION })
              : undefined
          }
          sessionCount={sessionCount}
          anyProcessing={anyProcessing}
        />
        <ChatErrorBanner
          errorMessage={errorMessage}
          state={state}
          onRetry={handleRetryFromError}
          onDismiss={dismissError}
        />
        <div className="relative flex-1 min-h-0 flex flex-col min-w-0">
          <div
            ref={scroll.scrollRef}
            onScroll={scroll.onScroll}
            className="chat-messages-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 pb-24 sm:pb-28"
          >
            <div className="min-w-0">
              <MessageList
                ref={messageListRef}
                messages={filteredMessages}
                streamingText={streamingText}
                isStreaming={state === CHAT_STATES.AWAITING_RESPONSE}
                lastUserMessage={state === CHAT_STATES.AWAITING_RESPONSE ? lastUserMessage : null}
                scrollRef={scroll.scrollRef}
                bothSidebarsCollapsed={
                  !isMobile && (compactMode ? !compactFileBrowserOpen : sidebarCollapsed) && rightSidebarCollapsed
                }
                noOutputBody={t('chat.noOutput')}
                onRetry={handleSendContinue}
              />
              <div ref={scroll.endRef} />
            </div>
          </div>
          {/* Local MCP tool cards — rendered below message list, above input */}
          {localToolItems.length > 0 && (
            <div className="px-3 sm:px-4 md:px-6 flex flex-col gap-1">
              {localToolItems.map((item) => {
                if (item.kind === 'ask') {
                  return (
                    <QuestionCard
                      key={item.questionId}
                      questionId={item.questionId}
                      question={item.question}
                      placeholder={item.placeholder}
                      onAnswer={handleAnswerQuestion}
                    />
                  );
                }
                if (item.kind === 'confirm') {
                  return (
                    <ConfirmCard
                      key={item.questionId}
                      questionId={item.questionId}
                      message={item.message}
                      confirmLabel={item.confirmLabel}
                      cancelLabel={item.cancelLabel}
                      onConfirm={handleConfirmQuestion}
                    />
                  );
                }
                if (item.kind === 'image') {
                  return (
                    <ShowImageCard
                      key={item.key}
                      url={item.url}
                      base64={item.base64}
                      mimeType={item.mimeType}
                      caption={item.caption}
                    />
                  );
                }
                return null;
              })}
            </div>
          )}
          {!scroll.isAtBottom && (
            <button
              type="button"
              onClick={() => scroll.scrollToBottom('smooth')}
              className="absolute bottom-4 right-4 sm:right-6 md:right-8 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full bg-card/95 border border-border shadow-lg text-sm font-medium text-foreground hover:bg-violet-500/10 hover:border-violet-500/30 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:ring-offset-2 focus:ring-offset-background transition-colors"
              aria-label={t('header.jumpLatest')}
            >
              <ChevronDown className="size-4 shrink-0" aria-hidden />
              <span>{t('header.latest')}</span>
            </button>
          )}
        </div>
        {viewingFile && (
          <Suspense fallback={
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background rounded-xl border border-border">
              <Loader2 className="size-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
            </div>
          }>
            <div
              className="absolute inset-0 z-10 flex flex-col min-h-0 bg-background"
              role="dialog"
              aria-modal="true"
              aria-label={t('header.files')}
            >
              <LazyFileViewerPanel
                entry={viewingFile!}
                onClose={() => setViewingFile(null)}
                inline
                apiBasePath={viewingFile.source === 'agent' ? API_PATHS.AGENT_FILES_FILE : undefined}
                onDirtyChange={handlePageDirtyChange}
              />
            </div>
          </Suspense>
        )}
        </div>
        <ChatInputArea
          state={state}
          inputValue={inputValue}
          onInputChange={(v, c) => setInputState({ value: v, cursor: c })}
          onCursorChange={(c) => setInputState((prev) => ({ ...prev, cursor: c }))}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={getChatInputPlaceholderWithT(state, t)}
          chatInputRef={chatInputRef}
          mentionOpen={mentionOpen}
          atMentionQuery={atMention.query}
          playgroundEntries={playgroundEntries}
          onMentionSelect={handleMentionSelect}
          onMentionClose={handleMentionClose}
          pendingImages={pendingImages}
          pendingAttachments={pendingAttachments}
          pendingVoice={pendingVoice}
          voiceRecorder={voiceRecorder}
          voiceUploadError={voiceUploadError}
          attachmentUploadError={attachmentUploadError}
          onRemovePendingImage={removePendingImage}
          onRemovePendingAttachment={removePendingAttachment}
          onRemovePendingVoice={removePendingVoice}
          onFileChange={handleFileChange}
          onSend={handleSend}
          onRequestInputFocus={() => focusInput({ persistent: true })}
          onInterrupt={interruptAgent}
          onVoiceToggle={handleVoiceToggle}
          maxPendingTotal={MAX_PENDING_TOTAL}
        />
        <RightDrawer
          open={terminalOpen}
          onClose={closeTerminal}
          title={t('drawer.shell')}
          icon={<TerminalSquare />}
          width="min(90vw, 680px)"
          className="font-mono"
        >
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center bg-[#0d0d14]">
              <Loader2 className="size-5 animate-spin text-violet-400 mr-2" />
              <span className="text-sm text-muted-foreground">{t('drawer.startingTerminal')}</span>
            </div>
          }>
            <LazyTerminalPanel />
          </Suspense>
        </RightDrawer>
        <RightDrawer
          open={canShowDiff && diffOpen}
          onClose={closeDiff}
          title={t('drawer.playgroundDiff')}
          icon={<GitCompareArrows className="size-4" />}
          width="min(90vw, 720px)"
          className="font-mono"
        >
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center bg-[#0d0d14]">
              <Loader2 className="size-5 animate-spin text-emerald-400 mr-2" />
              <span className="text-sm text-muted-foreground">{t('drawer.loadingDiff')}</span>
            </div>
          }>
            {diffOpen && <LazyDiffPanel />}
          </Suspense>
        </RightDrawer>
        <RightDrawer
          open={cliOpen}
          onClose={closeCli}
          title={t('header.commands')}
          icon={<Command className="size-4" />}
          width="min(90vw, 520px)"
        >
          <CliDrawerContent
            onSelectCommand={(cmd) => {
              setInputState({ value: cmd, cursor: cmd.length });
              closeCli();
              chatInputRef.current?.focus();
            }}
          />
        </RightDrawer>
    <NotifyToastContainer toasts={toasts} onDismiss={handleDismissToast} />
    </ChatLayout>
  );
}
