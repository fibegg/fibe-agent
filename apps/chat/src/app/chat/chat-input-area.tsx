import { Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { useRef } from 'react';
import { MentionInput } from './mention-input';
import { FileMentionDropdown } from './file-mention-dropdown';
import { CHAT_STATES } from './chat-state';
import type { PlaygroundEntryItem } from './use-playground-files';
import { FileIcon } from '../file-icon';

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
  pendingImages: string[];
  pendingAttachments: Array<{ filename: string; name: string }>;
  pendingVoice: string | null;
  voiceRecorder: {
    isSupported: boolean;
    isRecording: boolean;
    recordingTimeSec: number;
    error: string | null;
  };
  voiceUploadError: string | null;
  attachmentUploadError: string | null;
  onRemovePendingImage: (index: number) => void;
  onRemovePendingAttachment: (index: number) => void;
  onRemovePendingVoice: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onInterrupt: () => void;
  onVoiceToggle: () => void;
  maxPendingTotal: number;
  queuedCount?: number;
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
  onInterrupt,
  onVoiceToggle,
  maxPendingTotal,
  queuedCount = 0,
}: ChatInputAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isWorking = state === CHAT_STATES.AWAITING_RESPONSE;
  const isReady = state === CHAT_STATES.AUTHENTICATED;
  const canType = isReady || isWorking;
  const canAttach =
    isReady &&
    pendingImages.length + pendingAttachments.length < maxPendingTotal;

  return (
    <div className="shrink-0 p-3 sm:p-4 md:p-6 border-t border-border bg-card/30 backdrop-blur-sm">
      <div className="flex flex-col gap-2">
        {(pendingImages.length > 0 || pendingVoice || pendingAttachments.length > 0) && (
          <div className="flex flex-wrap gap-2 items-center">
            {pendingVoice && (
              <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-card/60">
                <audio src={pendingVoice} controls className="max-h-10 min-w-[160px]" />
                <button
                  type="button"
                  onClick={onRemovePendingVoice}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center hover:opacity-90"
                  aria-label="Remove voice"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            )}
            {pendingImages.map((dataUrl, i) => (
              <div key={`img-${i}`} className="relative inline-block">
                <img
                  src={dataUrl}
                  alt=""
                  className="w-16 h-16 object-cover rounded-xl border border-border/50"
                />
                <button
                  type="button"
                  onClick={() => onRemovePendingImage(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center hover:opacity-90"
                  aria-label="Remove image"
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
                <FileIcon pathOrName={a.name} size={16} className="shrink-0 text-muted-foreground" />
                <span className="text-xs truncate text-foreground min-w-0" title={a.name}>
                  {a.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePendingAttachment(i)}
                  className="shrink-0 size-5 rounded-full bg-destructive text-white flex items-center justify-center hover:opacity-90"
                  aria-label="Remove attachment"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
        {(voiceRecorder.error || voiceUploadError || attachmentUploadError) && (
          <p className="text-destructive text-sm">
            {voiceRecorder.error ?? voiceUploadError ?? attachmentUploadError}
          </p>
        )}
        <div className="flex items-end gap-2 sm:gap-3 bg-card rounded-2xl border border-border p-2 sm:p-3 shadow-xl shadow-violet-500/5">
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
            title="Attach files"
            aria-label="Attach files"
          >
            <Paperclip className="size-3.5 sm:size-4" />
          </button>
          <div
            className="relative flex-1 min-w-0"
            title={state === CHAT_STATES.AUTHENTICATED ? 'Type @ to link a file' : undefined}
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
              className="w-full bg-transparent"
            />
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
              className={`size-8 sm:size-9 rounded-md flex items-center justify-center transition-colors shrink-0 ${
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
                    {Math.floor(voiceRecorder.recordingTimeSec / 60)}:
                    {(voiceRecorder.recordingTimeSec % 60).toString().padStart(2, '0')}
                  </span>
                </>
              ) : (
                <Mic className="size-3.5 sm:size-4" />
              )}
            </button>
          )}
          {isWorking ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onSend}
                disabled={!inputValue.trim()}
                className="relative size-8 sm:size-9 rounded-md flex items-center justify-center bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white disabled:opacity-30 transition-opacity"
                aria-label="Queue message"
                title="Queue message for agent"
              >
                <Send className="size-3.5 sm:size-4" />
                {queuedCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
                    {queuedCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={onInterrupt}
                className="size-8 sm:size-9 rounded-md flex items-center justify-center border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Stop"
              >
                <Square className="size-3.5 sm:size-4 fill-current" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!isReady}
              className="size-8 sm:size-9 rounded-md flex items-center justify-center bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white disabled:opacity-50 transition-opacity"
              aria-label="Send"
            >
              <Send className="size-3.5 sm:size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
