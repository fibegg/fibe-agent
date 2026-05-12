import {
  AlertCircle,
  CornerDownRight,
  MicOff,
  Mic,
  Paperclip,
  Send,
  Square,
  Timer,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { MentionInput } from './mention-input';
import { FileMentionDropdown } from './file-mention-dropdown';
import { CHAT_STATES } from './chat-state';
import type { PlaygroundEntryItem } from './use-playground-files';
import { FileIcon } from '../file-icon';
import { useT } from '../i18n';
import { formatSessionDurationMs } from '../agent-thinking-utils';

const ACCEPT_FILES =
  'image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.json,.md,.rtf,application/pdf,text/plain,text/csv,application/json';

export interface ChatInputAreaProps {
  state: string;
  inputValue: string;
  onInputChange: (value: string, cursor: number) => void;
  onCursorChange: (cursor: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  placeholder: string;
  chatInputRef: React.RefObject<HTMLDivElement | null>;
  mentionOpen: boolean;
  atMentionQuery: string;
  playgroundEntries: PlaygroundEntryItem[];
  onMentionSelect: (path: string) => void;
  onMentionClose: () => void;
  pendingImages: { url: string; filename: string }[];
  pendingAttachments: Array<{ filename: string; name: string }>;
  pendingVoice: string | null;
  voiceRecorder: {
    isSupported: boolean;
    isRecording: boolean;
    recordingTimeSec: number;
    liveText: string;
    error: string | null;
  };
  voiceUploadError: string | null;
  attachmentUploadError: string | null;
  onRemovePendingImage: (index: number) => void;
  onRemovePendingAttachment: (index: number) => void;
  onRemovePendingVoice: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onSteer?: () => void;
  onRequestInputFocus: () => void;
  onInterrupt: () => void;
  onVoiceToggle: () => void;
  maxPendingTotal: number;
  workingElapsedMs?: number;
  steerMode?: 'live' | 'next';
}

export function ChatInputArea({
  state,
  inputValue,
  onInputChange,
  onCursorChange,
  onKeyDown,
  onPaste,
  placeholder,
  chatInputRef,
  mentionOpen,
  atMentionQuery,
  playgroundEntries,
  onMentionSelect,
  onMentionClose,
  pendingImages,
  pendingAttachments,
  pendingVoice,
  voiceRecorder,
  voiceUploadError,
  attachmentUploadError,
  onRemovePendingImage,
  onRemovePendingAttachment,
  onRemovePendingVoice,
  onFileChange,
  onSend,
  onSteer,
  onRequestInputFocus,
  onInterrupt,
  onVoiceToggle,
  maxPendingTotal,
  workingElapsedMs = 0,
  steerMode = 'live',
}: ChatInputAreaProps) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dismissedVoiceError, setDismissedVoiceError] = useState<string | null>(
    null,
  );

  const isWorking = state === CHAT_STATES.AWAITING_RESPONSE;
  const isReady = state === CHAT_STATES.AUTHENTICATED;
  const canType = isReady || isWorking;
  const steerIsLive = steerMode === 'live';
  const canAttach =
    isReady &&
    pendingImages.length + pendingAttachments.length < maxPendingTotal;

  // Resolve the voice error message — translate mic-denied specifically
  const rawVoiceError = voiceRecorder.error;
  const isMicDenied =
    rawVoiceError !== null &&
    (rawVoiceError.toLowerCase().includes('permission') ||
      rawVoiceError.toLowerCase().includes('denied') ||
      rawVoiceError.toLowerCase().includes('notallowed'));
  const voiceErrorMsg =
    rawVoiceError === null
      ? null
      : rawVoiceError === dismissedVoiceError
        ? null
        : isMicDenied
          ? t('chat.input.micDenied')
          : rawVoiceError;

  const activeError =
    voiceErrorMsg ?? voiceUploadError ?? attachmentUploadError;

  return (
    <div
      className="shrink-0 p-3 sm:p-4 md:p-6 border-t border-border/30 bg-card/30 backdrop-blur-sm"
      style={{
        paddingBottom:
          'max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + var(--keyboard-height, 0px)))',
      }}
    >
      <div className="flex flex-col gap-2">
        {(pendingImages.length > 0 ||
          pendingVoice ||
          pendingAttachments.length > 0) && (
          <div className="flex flex-wrap gap-2 items-center">
            {pendingVoice && (
              <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-card/60">
                <audio
                  src={pendingVoice}
                  controls
                  className="max-h-10 min-w-[160px]"
                />
                <button
                  type="button"
                  onClick={onRemovePendingVoice}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center hover:opacity-90"
                  aria-label={t('chat.input.removeVoice')}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            )}
            {pendingImages.map((img, i) => (
              <div key={`img-${i}`} className="relative inline-block">
                <img
                  src={img.url}
                  alt=""
                  className="w-16 h-16 object-cover rounded-xl border border-border/50"
                />
                <button
                  type="button"
                  onClick={() => onRemovePendingImage(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center hover:opacity-90"
                  aria-label={t('chat.input.removeImage')}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            ))}
            {pendingAttachments.map((a, i) => (
              <div
                key={`att-${i}`}
                className="relative flex items-center gap-2 pl-2 pr-1 py-1.5 min-h-9 rounded-xl border border-border/50 bg-card/60 max-w-[180px]"
              >
                <FileIcon
                  pathOrName={a.name}
                  size={16}
                  className="shrink-0 text-muted-foreground"
                />
                <span
                  className="text-xs truncate text-foreground min-w-0"
                  title={a.name}
                >
                  {a.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePendingAttachment(i)}
                  className="shrink-0 size-5 rounded-full bg-destructive text-white flex items-center justify-center hover:opacity-90"
                  aria-label={t('chat.input.removeAttachment')}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
        {activeError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2 text-sm text-red-400 animate-modal-enter">
            {isMicDenied ? (
              <MicOff className="size-4 shrink-0 mt-0.5" aria-hidden />
            ) : (
              <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
            )}
            <span className="flex-1">{activeError}</span>
            {voiceErrorMsg && (
              <button
                type="button"
                onClick={() => setDismissedVoiceError(rawVoiceError)}
                className="shrink-0 size-4 flex items-center justify-center text-red-400/60 hover:text-red-300 transition-colors"
                aria-label={t('common.close')}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
        {isWorking && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-500/20 bg-violet-500/[0.07] px-3 py-2 text-xs">
            <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
                <Timer className="size-3" aria-hidden />
              </span>
              <span className="min-w-0 truncate">
                {t('chat.input.agentWorking')}
              </span>
              <span
                className="shrink-0 font-mono tabular-nums text-violet-200"
                title={t('chat.input.workingTime')}
              >
                {formatSessionDurationMs(workingElapsedMs)}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              <span className="rounded-full bg-background/70 px-2 py-1">
                {t('chat.input.queueHint')}
              </span>
              <span className="rounded-full bg-background/70 px-2 py-1">
                {t(
                  steerIsLive
                    ? 'chat.input.steerHint'
                    : 'chat.input.steerNextHint',
                )}
              </span>
            </div>
          </div>
        )}
        <div className="flex items-end gap-2 sm:gap-3 bg-card rounded-2xl border border-border/60 p-2 sm:p-3 shadow-xl shadow-violet-500/[0.04] transition-shadow duration-300 focus-within:shadow-violet-500/[0.08]">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_FILES}
            multiple
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canAttach}
            className="size-8 sm:size-9 rounded-md flex items-center justify-center text-violet-400 hover:text-violet-500 hover:bg-violet-500/10 transition-colors shrink-0 disabled:opacity-50"
            title={t('chat.input.attachFiles')}
            aria-label={t('chat.input.attachFiles')}
          >
            <Paperclip className="size-3.5 sm:size-4" />
          </button>
          <div
            className="relative flex-1 min-w-0"
            title={
              state === CHAT_STATES.AUTHENTICATED
                ? t('chat.input.typeAt')
                : undefined
            }
          >
            <MentionInput
              inputRef={chatInputRef}
              id="chat-input"
              value={inputValue}
              onChange={(v) => onInputChange(v, v.length)}
              onValueAndCursor={onInputChange}
              onCursorChange={onCursorChange}
              placeholder={placeholder}
              disabled={!canType}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              className={`w-full bg-transparent ${voiceRecorder.isRecording ? 'opacity-0' : ''}`}
            />
            {voiceRecorder.isRecording && (
              <div className="absolute inset-0 z-10 flex items-center px-3 overflow-hidden pointer-events-none">
                <span className="text-sm text-foreground/80 break-words line-clamp-1 italic">
                  {voiceRecorder.liveText || t('chat.input.listening')}
                </span>
              </div>
            )}
            <FileMentionDropdown
              open={mentionOpen}
              query={atMentionQuery}
              entries={playgroundEntries}
              anchorRef={chatInputRef}
              onSelect={onMentionSelect}
              onClose={onMentionClose}
            />
          </div>
          {voiceRecorder.isSupported && (
            <button
              type="button"
              onClick={onVoiceToggle}
              disabled={!isReady}
              className={`rounded-md flex items-center justify-center transition-colors shrink-0 ${
                voiceRecorder.isRecording
                  ? 'min-w-8 sm:min-w-9 h-8 sm:h-9 px-1.5 bg-destructive/90 hover:bg-destructive text-white'
                  : 'size-8 sm:size-9 text-violet-400 hover:text-violet-500 hover:bg-violet-500/10'
              }`}
              title={
                voiceRecorder.isRecording
                  ? t('chat.input.stopRecording')
                  : t('chat.input.voiceInput')
              }
              aria-label={
                voiceRecorder.isRecording
                  ? t('chat.input.stopRecording')
                  : t('chat.input.voiceInput')
              }
            >
              {voiceRecorder.isRecording ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
                  <span className="text-xs tabular-nums ml-1 truncate">
                    {Math.floor(voiceRecorder.recordingTimeSec / 60)}:
                    {(voiceRecorder.recordingTimeSec % 60)
                      .toString()
                      .padStart(2, '0')}
                  </span>
                </>
              ) : (
                <Mic className="size-3.5 sm:size-4" />
              )}
            </button>
          )}
          {isWorking ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSend();
                  onRequestInputFocus();
                }}
                disabled={!inputValue.trim()}
                className="relative h-8 sm:h-9 rounded-md flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 px-2.5 hover:from-violet-700 hover:to-purple-700 text-white disabled:opacity-30 transition-opacity"
                aria-label={t('chat.input.queueMessage')}
                title={t('chat.input.queueMessageTitle')}
              >
                <Send className="size-3.5 sm:size-4" />
                <span className="hidden sm:inline text-xs font-medium">
                  {t('chat.input.queueShort')}
                </span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSteer?.();
                  onRequestInputFocus();
                }}
                disabled={!inputValue.trim()}
                className="relative h-8 sm:h-9 rounded-md flex items-center justify-center gap-1.5 border border-violet-500/40 bg-violet-500/10 px-2.5 hover:bg-violet-500/20 text-violet-300 disabled:opacity-30 transition-opacity"
                aria-label={t(
                  steerIsLive
                    ? 'chat.input.steerMessage'
                    : 'chat.input.steerNextMessage',
                )}
                title={t(
                  steerIsLive
                    ? 'chat.input.steerMessageTitle'
                    : 'chat.input.steerNextMessageTitle',
                )}
              >
                <CornerDownRight className="size-3.5 sm:size-4" />
                <span className="hidden sm:inline text-xs font-medium">
                  {t(
                    steerIsLive
                      ? 'chat.input.steerShort'
                      : 'chat.input.steerNextShort',
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={onInterrupt}
                className="size-8 sm:size-9 rounded-md flex items-center justify-center border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t('chat.input.stop')}
              >
                <Square className="size-3.5 sm:size-4 fill-current" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSend();
                onRequestInputFocus();
              }}
              disabled={!isReady}
              className="size-8 sm:size-9 rounded-xl flex items-center justify-center bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white disabled:opacity-50 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95]"
              aria-label={t('chat.input.send')}
            >
              <Send className="size-3.5 sm:size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
