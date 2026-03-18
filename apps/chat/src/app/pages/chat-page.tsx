import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AuthModal } from '../chat/auth-modal';
import { MessageList, type MessageListHandle } from '../chat/message-list';
import { useChatWebSocket } from '../chat/use-chat-websocket';
import { useScrollToBottom } from '../chat/use-scroll-to-bottom';
import { usePlaygroundFiles } from '../chat/use-playground-files';
import { useChatLayout } from '../chat/use-chat-layout';
import { useVoiceRecorder } from '../chat/use-voice-recorder';
import { useChatAttachments, MAX_PENDING_TOTAL } from '../chat/use-chat-attachments';
import { useChatActivityLog } from '../chat/use-chat-activity-log';
import { useChatInitialData } from '../chat/use-chat-initial-data';
import { useChatModel } from '../chat/use-chat-model';
import { useChatDisplayState } from '../chat/use-chat-display-state';
import { useChatInput } from '../chat/use-chat-input';
import { useChatAuthUI } from '../chat/use-chat-auth-ui';
import { FileExplorer, FileViewerPanel, type PlaygroundEntry } from '../file-explorer/file-explorer';
import { CHAT_STATES, getChatInputPlaceholder } from '../chat/chat-state';
import type { ServerMessage } from '../chat/chat-state';
import { isAuthenticated, isChatModelLocked } from '../api-url';
import { MAIN_CONTENT_MIN_WIDTH_PX, SIDEBAR_COLLAPSED_WIDTH_PX, SIDEBAR_WIDTH_PX } from '../layout-constants';
import { AgentThinkingSidebar } from '../agent-thinking-sidebar';
import { getActivityPath } from '../activity-path';
import { ChatSettingsModal } from '../chat/chat-settings-modal';
import { ChatHeader } from '../chat/chat-header';
import { ChatErrorBanner } from '../chat/chat-error-banner';
import { ChatInputArea } from '../chat/chat-input-area';
import { DragDropOverlay } from '../chat/drag-drop-overlay';
import { MODAL_OVERLAY_DARK, MOBILE_SHEET_PANEL } from '../ui-classes';

const NO_OUTPUT_MESSAGE = 'Process completed successfully but returned no output.';

export function ChatPage() {
  const navigate = useNavigate();
  const [streamingText, setStreamingText] = useState('');
  const sendRef = useRef<(payload: Record<string, unknown>) => void>(() => undefined);
  const handleSendRef = useRef<() => void>(() => undefined);

  const authenticated = isAuthenticated();
  const { messages, setMessages, modelOptions, refreshingModels, refreshModelOptions } = useChatInitialData(authenticated);
  const scroll = useScrollToBottom([messages, streamingText]);

  const { entries: playgroundEntries, tree: playgroundTree, loading: playgroundLoading, refetch: refetchPlaygrounds } =
    usePlaygroundFiles();
  const hasPlaygroundFiles = playgroundEntries.length > 0;
  const layout = useChatLayout(hasPlaygroundFiles, playgroundLoading);
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
  } = useChatInput({ playgroundEntries, onSendRef: handleSendRef });
  const messageListRef = useRef<MessageListHandle | null>(null);

  useEffect(() => {
    if (!authenticated) {
      navigate('/login', { replace: true });
    }
  }, [authenticated, navigate]);

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
          return [...prev.slice(0, -1), { ...serverMsg, ...(last.queued ? { queued: true } : {}) }];
        }
        return [...prev, serverMsg];
      });
    }
    if (data.type === 'model_updated' && data.model !== undefined) {
      setCurrentModel(data.model);
    }
  }, [setCurrentModel]);

  const voiceRecorder = useVoiceRecorder();

  const {
    state,
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
    (chunk) => flushSync(() => setStreamingText((prev) => prev + chunk)),
    (data) => {
      setStreamingText('');
      resetForNewStream(data);
    },
    (finalText) => {
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
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          body: text,
          created_at: new Date().toISOString(),
          story: storyForApi,
        },
      ]);
      sendRef.current({ action: 'submit_story', story: storyForApi });
      setStreamingText('');
      setLastSentMessage(null);
      refetchPlaygrounds();
    },
    thinkingCallbacks,
    refetchPlaygrounds
  );

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const {
    pendingImages,
    pendingAttachments,
    pendingVoice,
    pendingVoiceFilename,
    voiceUploadError,
    attachmentUploadError,
    setVoiceUploadError,
    setPendingVoice,
    setPendingVoiceFilename,
    removePendingImage,
    removePendingVoice,
    removePendingAttachment,
    handleFileChange,
    clearPending,
    uploadAttachment,
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
  } = useChatDisplayState({
    messages,
    searchQuery,
    state,
    activityLog,
    sessionActivity,
    lastSentMessage,
  });

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    const isQueuing = state === CHAT_STATES.AWAITING_RESPONSE;
    const hasVoice = !!pendingVoiceFilename || !!pendingVoice;
    const hasContent =
      text || pendingImages.length > 0 || hasVoice || pendingAttachments.length > 0;
    if (!hasContent) return;
    if (!isQueuing && state !== CHAT_STATES.AUTHENTICATED) return;

    if (isQueuing) {
      // Queue mode — text only
      if (!text) return;
      send({ action: 'queue_message', text });
    } else {
      send({
        action: 'send_chat_message',
        text: text || '',
        ...(pendingImages.length ? { images: pendingImages } : {}),
        ...(pendingVoiceFilename ? { audioFilename: pendingVoiceFilename } : pendingVoice ? { audio: pendingVoice } : {}),
        ...(pendingAttachments.length ? { attachmentFilenames: pendingAttachments.map((a) => a.filename) } : {}),
      });
    }
    if (text) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', body: text, created_at: new Date().toISOString(), optimistic: true, ...(isQueuing ? { queued: true } : {}) },
      ]);
    }
    setLastSentMessage(text || null);
    setInputState({ value: '', cursor: 0 });
    if (!isQueuing) clearPending();
    scroll.markJustSent();
  }, [send, state, inputValue, pendingImages, pendingVoice, pendingVoiceFilename, pendingAttachments, scroll, clearPending]);

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
  }, [send, scroll]);

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
  }, [queuedCount]);

  const uploadVoiceFile = useCallback(
    async (blob: Blob): Promise<string | null> => {
      const file = new File([blob], 'recording.webm');
      return uploadAttachment(file);
    },
    [uploadAttachment]
  );

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

  const { statusClass, showModelSelector, showAuthModal, authModalForModal } = useChatAuthUI(
    state,
    authModal
  );

  if (!authenticated) {
    return null;
  }

  return (
    <div
      className={`flex h-screen w-full min-h-0 overflow-hidden bg-gradient-to-br from-background via-background to-violet-950/10 relative ${isDragOver ? 'ring-2 ring-inset ring-violet-500 ring-offset-2 ring-offset-background' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && <DragDropOverlay />}
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
      {isMobile && sidebarOpen && (
        <>
          <div
            className={`${MODAL_OVERLAY_DARK} lg:hidden`}
            aria-hidden
            onClick={closeMobileSidebar}
          />
          <div className={`${MOBILE_SHEET_PANEL} left-0 bg-gradient-to-br from-background via-background to-violet-950/5 border border-violet-500/20`}>
            <FileExplorer
              tree={playgroundTree}
              onSettingsClick={() => setSettingsOpen(true)}
              onClose={closeMobileSidebar}
              onFileSelect={(entry) => {
                setViewingFile(entry);
                closeMobileSidebar();
              }}
              selectedPath={viewingFile?.path ?? null}
            />
          </div>
        </>
      )}
      {isMobile && rightSidebarOpen && (
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
              mobileOverlay
              onActivityClick={(payload) => navigate(getActivityPath(payload))}
            />
          </div>
        </>
      )}
      {!isMobile && (
        <div
          className="flex min-h-0 flex-shrink-0 flex-col overflow-visible transition-[width] duration-300 ease-out"
          style={{
            width:
              !hasPlaygroundFiles || sidebarCollapsed
                ? SIDEBAR_COLLAPSED_WIDTH_PX
                : SIDEBAR_WIDTH_PX,
          }}
        >
          <aside className="flex min-h-0 flex-1 flex-col overflow-visible relative">
            <FileExplorer
              tree={playgroundTree}
              collapsed={!hasPlaygroundFiles || sidebarCollapsed}
              onSettingsClick={() => setSettingsOpen(true)}
              onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
              onFileSelect={(entry) => setViewingFile(entry)}
              selectedPath={viewingFile?.path ?? null}
            />
          </aside>
        </div>
      )}
      <main
        className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent"
        style={{ minWidth: MAIN_CONTENT_MIN_WIDTH_PX }}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden w-full">
        <div className="relative flex-1 min-h-0 flex flex-col min-w-0">
        <ChatHeader
          isMobile={isMobile}
          state={state}
          errorMessage={errorMessage}
          sessionTimeMs={sessionTimeMs}
          mobileSessionStats={mobileSessionStats}
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
            className="chat-messages-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8"
          >
            <div>
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
              onClick={() => {
                messageListRef.current?.scrollToBottom('smooth');
                scroll.scrollToBottom('smooth');
              }}
              className="absolute bottom-4 right-4 sm:right-6 md:right-8 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full bg-card/95 border border-border shadow-lg text-sm font-medium text-foreground hover:bg-violet-500/10 hover:border-violet-500/30 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:ring-offset-2 focus:ring-offset-background transition-colors"
              aria-label="Jump to latest messages"
            >
              <ChevronDown className="size-4 shrink-0" aria-hidden />
              <span>Latest</span>
            </button>
          )}
        </div>
        {viewingFile && (
          <div
            className="absolute inset-0 z-10 flex flex-col min-h-0 bg-background"
            role="dialog"
            aria-modal="true"
            aria-label="File viewer"
          >
            <FileViewerPanel
              entry={viewingFile}
              onClose={() => setViewingFile(null)}
              inline
            />
          </div>
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
        </div>
      </main>
      {!isMobile && (
        <AgentThinkingSidebar
          isCollapsed={rightSidebarCollapsed}
          onToggle={() => setRightSidebarCollapsed((v) => !v)}
          isStreaming={state === CHAT_STATES.AWAITING_RESPONSE}
          reasoningText={reasoningText}
          streamingResponseText={streamingText}
          thinkingSteps={thinkingSteps}
          storyItems={displayStory}
          sessionActivity={sessionActivity}
          pastActivityFromMessages={pastActivityFromMessages}
          onActivityClick={(payload) => navigate(getActivityPath(payload))}
        />
      )}
    </div>
  );
}

