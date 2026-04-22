import { ChevronDown, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthModal } from '../chat/auth-modal';
import { MessageList, type MessageListHandle } from '../chat/message-list';
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
import { useChatDisplayState } from '../chat/use-chat-display-state';
import { useChatInput } from '../chat/use-chat-input';
import { useChatAuthUI } from '../chat/use-chat-auth-ui';
import { useChatStreaming } from '../chat/use-chat-streaming';
import { FileExplorer, type PlaygroundEntry } from '../file-explorer/file-explorer';
import type { FileTab } from '../file-explorer/file-explorer-tabs';
import { ChatLeftPanel } from './chat-left-panel';
import { ChatRightPanel } from './chat-right-panel';
import { CHAT_STATES, getChatInputPlaceholder } from '../chat/chat-state';
import type { ServerMessage } from '../chat/chat-state';
import { isAuthenticated, isChatModelLocked } from '../api-url';
import { consumeGreeting } from '../postmessage-greeting';
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

const LazyFileViewerPanel = lazy(() => import('../file-explorer/file-viewer-panel').then((m) => ({ default: m.FileViewerPanel })));
const LazyTerminalPanel = lazy(() => import('../terminal/terminal-panel').then((m) => ({ default: m.TerminalPanel })));

const NO_OUTPUT_MESSAGE = 'Process completed successfully but returned no output.';

/** Returns a keyboard-aware terminal height for mobile.
 *  On desktop (>= 640px) returns the fixed 280px.
 *  On mobile it caps at 45dvh of the visual viewport so the terminal
 *  stays visible above the virtual keyboard when it opens. */
function useTerminalHeight(isMobile: boolean): string {
  const [height, setHeight] = useState('280px');
  useEffect(() => {
    if (!isMobile) { setHeight('280px'); return; }
    const update = () => {
      const vvh = window.visualViewport?.height ?? window.innerHeight;
      const maxH = Math.floor(vvh * 0.45);
      setHeight(`${Math.max(160, Math.min(maxH, 280))}px`);
    };
    update();
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      if (vv) vv.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, [isMobile]);
  return height;
};

export function ChatPage() {
  const navigate = useNavigate();
  const sendRef = useRef<(payload: Record<string, unknown>) => void>(() => undefined);
  const handleSendRef = useRef<() => void>(() => undefined);

  const authenticated = isAuthenticated();
  const { messages, setMessages, messagesLoaded, modelOptions, refreshingModels, refreshModelOptions } = useChatInitialData(authenticated);

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
  const terminalHeight = useTerminalHeight(isMobile);
  const pgSelector = usePlaygroundSelector();

  const [tonyStarkMode, setTonyStarkMode] = useState(() => localStorage.getItem('tony-stark-mode') === 'true');
  const handleToggleTonyStarkMode = useCallback(() => {
    setTonyStarkMode((prev) => {
      const next = !prev;
      localStorage.setItem('tony-stark-mode', String(next));
      return next;
    });
  }, []);

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
  } = useChatInput({ playgroundEntries, onSendRef: handleSendRef, isMobile });
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
        if (last?.role === 'user' && last?.optimistic && last.body === body) {
          return [...prev.slice(0, -1), { ...serverMsg, ...(last.queued ? { queued: true } : {}) }];
        }
        return [...prev, serverMsg];
      });
    }
    if (data.type === 'model_updated' && data.model !== undefined) {
      setCurrentModel(data.model);
    }
  }, [setCurrentModel, setMessages]);

  const voiceRecorder = useVoiceRecorder();
  const localStt = useLocalStt();
  const voiceRecorderRef = useRef(voiceRecorder);
  useEffect(() => { voiceRecorderRef.current = voiceRecorder; });
  const localSttRef = useRef(localStt);
  useEffect(() => { localSttRef.current = localStt; });

  const onStreamEndCallback = useCallback(
    (finalText: string, usage?: { inputTokens: number; outputTokens: number }, model?: string, streamModel?: string | null) => {
      const text = finalText?.trim() || NO_OUTPUT_MESSAGE;
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
    [setMessages, refetchPlaygrounds, activityLogRef]
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
    queuedCount,
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
    refetchPlaygrounds
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
        ...(currentPendingImages.length ? { images: currentPendingImages } : {}),
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
  }, [
    send, state, inputValue, pendingImages, pendingVoice, pendingVoiceFilename, pendingAttachments, scroll,
    clearPending, setInputState, setMessages, stopAndTranscribe,
  ]);

  const handleSendContinue = useCallback(() => {
    send({
      action: 'send_chat_message',
      text: 'Continue',
    });
    setMessages((prev) => [
      ...prev,
      { role: 'user', body: 'Continue', created_at: new Date().toISOString(), optimistic: true },
    ]);
    setLastSentMessage('Continue');
    scroll.markJustSent();
  }, [send, scroll, setMessages]);

  const handleRetryFromError = useCallback(() => {
    dismissError();
    handleSendContinue();
  }, [dismissError, handleSendContinue]);

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // Clear queued badges when queuedCount drops from >0 to 0 (new session started)
  const prevQueuedCountRef = useRef(0);
  useEffect(() => {
    const wasPositive = prevQueuedCountRef.current > 0;
    prevQueuedCountRef.current = queuedCount;
    if (wasPositive && queuedCount === 0) {
      setMessages((prev) => {
        if (!prev.some((m) => m.queued)) return prev;
        return prev.map((m) => (m.queued ? { ...m, queued: false } : m));
      });
    }
  }, [queuedCount, setMessages]);

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
            onStartAuth={startAuth}
            onReauthenticate={reauthenticate}
            onLogout={logout}
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
                onSettingsClick={() => setSettingsOpen(true)}
                onClose={closeMobileSidebar}
                onFileSelect={(entry) => {
                  setViewingFile(entry);
                  closeMobileSidebar();
                }}
                selectedPath={viewingFile?.path ?? null}
                dirtyPaths={pageDirtyPaths}
              />
            </div>
          </>
        ) : null
      }
      mobileActivity={
        isMobile && rightSidebarOpen ? (
          <>
            <div
              className={`${MODAL_OVERLAY_DARK} lg:hidden`}
              aria-hidden
              onClick={() => setRightSidebarOpen(false)}
            />
            <div className={`${MOBILE_SHEET_PANEL} right-0 bg-background border-l border-violet-500/20`}>
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
            </div>
          </>
        ) : null
      }
      leftPanel={
        !isMobile ? (
          <ChatLeftPanel
            hasAnyFiles={hasAnyFiles}
            sidebarCollapsed={sidebarCollapsed}
            width={leftResize.width}
            isDraggingResize={leftResize.isDragging}
            panelRef={leftResize.panelRef}
            playgroundTree={playgroundTree}
            agentFileTree={agentFileTree as PlaygroundEntry[]}
            activeFileTab={activeFileTab}
            onTabChange={setActiveFileTab}
            playgroundStats={playgroundStats}
            agentStats={agentStats}
            onSettingsClick={() => setSettingsOpen(true)}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            onFileSelect={(entry) => setViewingFile(entry)}
            onResizeStart={leftResize.startResize}
            selectedPath={viewingFile?.path ?? null}
            dirtyPaths={pageDirtyPaths}
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
          state={state}
          agentMode={agentMode}
          errorMessage={errorMessage}
          sessionTimeMs={sessionTimeMs}
          mobileSessionStats={mobileSessionStats}
          sessionTokenUsage={sessionTokenUsage}
          mobileBrainClasses={mobileBrainClasses}
          statusClass={statusClass}
          showModelSelector={showModelSelector}
          currentModel={currentModel}
          modelOptions={modelOptions}
          searchQuery={searchQuery}
          filteredMessagesCount={filteredMessages.length}
          onSearchChange={setSearchQuery}
          onModelSelect={handleModelSelect}
          onModelInputChange={handleModelInputChange}
          onReconnect={reconnect}
          onStartAuth={startAuth}
          onOpenMenu={() => setSidebarOpen(true)}
          onOpenActivity={() => setRightSidebarOpen(true)}
          modelLocked={isChatModelLocked()}
          onRefreshModels={refreshModelOptions}
          refreshingModels={refreshingModels}
          onToggleTerminal={toggleTerminal}
          terminalOpen={terminalOpen}
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
                  !isMobile && sidebarCollapsed && rightSidebarCollapsed
                }
                noOutputBody={NO_OUTPUT_MESSAGE}
                onRetry={handleSendContinue}
              />
              <div ref={scroll.endRef} />
            </div>
          </div>
          {!scroll.isAtBottom && (
            <button
              type="button"
              onClick={() => scroll.scrollToBottom('smooth')}
              className="absolute bottom-4 right-4 sm:right-6 md:right-8 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full bg-card/95 border border-border shadow-lg text-sm font-medium text-foreground hover:bg-violet-500/10 hover:border-violet-500/30 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:ring-offset-2 focus:ring-offset-background transition-colors"
              aria-label="Jump to latest messages"
            >
              <ChevronDown className="size-4 shrink-0" aria-hidden />
              <span>Latest</span>
            </button>
          )}
        </div>
        {viewingFile && (
          <Suspense fallback={
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background rounded-xl border border-border">
              <Loader2 className="size-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Loading editor…</span>
            </div>
          }>
            <div
              className="absolute inset-0 z-10 flex flex-col min-h-0 bg-background"
              role="dialog"
              aria-modal="true"
              aria-label="File viewer"
            >
              <LazyFileViewerPanel
                entry={viewingFile!}
                onClose={() => setViewingFile(null)}
                inline
                apiBasePath={activeFileTab === 'agent' ? '/api/agent-files/file' : undefined}
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
          placeholder={getChatInputPlaceholder(state)}
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
          onInterrupt={interruptAgent}
          onVoiceToggle={handleVoiceToggle}
          maxPendingTotal={MAX_PENDING_TOTAL}
          queuedCount={queuedCount}
        />
        {terminalOpen && (
          <Suspense fallback={
            <div className="shrink-0 flex items-center justify-center border-t border-violet-500/20 bg-background" style={{ height: terminalHeight }}>
              <Loader2 className="size-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Starting terminal…</span>
            </div>
          }>
            <div
              className="shrink-0 overflow-hidden border-t border-violet-500/20 transition-[height] duration-300 ease-out"
              style={{ height: terminalHeight }}
            >
              <LazyTerminalPanel onClose={closeTerminal} />
            </div>
          </Suspense>
        )}
    </ChatLayout>
  );
}

