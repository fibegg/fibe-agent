import { useVirtualizer } from '@tanstack/react-virtual';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { FileCode, Sparkles, User } from 'lucide-react';
import { marked } from 'marked';
import { getApiUrl, getAuthTokenForRequest } from '../api-url';
import { FileIcon } from '../file-icon';
import { AT_MENTION_REGEX, pathDisplayName } from './mention-utils';
import { ThinkingAvatar, ThinkingState } from './thinking-state';

function MentionChipIcon({ path }: { path: string }) {
  return <FileIcon pathOrName={path} size={12} className="shrink-0 opacity-90" />;
}

function MessageBodyWithMentions({ body }: { body: string }) {
  const parts = body.split(AT_MENTION_REGEX);
  return (
    <span className="whitespace-pre-wrap text-sm leading-relaxed inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {parts.map((part, i) => {
        const match = part.match(/^@([^\s@]+)$/);
        if (match) {
          const path = match[1];
          return (
            <span
              key={`${i}-${path}`}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium bg-white/20 border border-white/30 text-violet-100 shadow-sm"
              title={path}
            >
              <MentionChipIcon path={path} />
              <span className="truncate max-w-[120px] sm:max-w-[160px]">{pathDisplayName(path)}</span>
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export interface ChatMessage {
  id?: string;
  role: string;
  body: string;
  created_at: string;
  imageUrls?: string[];
  story?: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: string;
    details?: string;
    command?: string;
    path?: string;
  }>;
  optimistic?: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mins = m < 10 ? `0${m}` : `${m}`;
  return `${h}:${mins} ${ampm}`;
}

function renderMarkdown(text: string): string {
  try {
    const out = marked.parse(text);
    return typeof out === 'string' ? out : escapeHtml(text);
  } catch {
    return escapeHtml(text);
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getUploadSrc(filename: string): string {
  const base = getApiUrl();
  const path = base ? `${base}/api/uploads/${encodeURIComponent(filename)}` : `/api/uploads/${encodeURIComponent(filename)}`;
  const token = getAuthTokenForRequest();
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

const ESTIMATED_ROW_HEIGHT = 120;
const ROW_GAP = 24;

const ASSISTANT_BUBBLE_CLASSES =
  'rounded-2xl rounded-tl-sm bg-card/60 backdrop-blur-md border border-border/50 shadow-lg text-card-foreground';

const TYPING_BUBBLE_CLASSES =
  'rounded-2xl rounded-tl-sm bg-card border border-border text-card-foreground';

const DEFAULT_MAX_WIDTH = 'max-w-[90%] sm:max-w-[85%] md:max-w-[80%]';
const FULL_WIDTH = 'max-w-full';

function MessageRow({
  msg,
  maxWidthClass = DEFAULT_MAX_WIDTH,
}: {
  msg: ChatMessage;
  maxWidthClass?: string;
}) {
  return (
    <div
      className={`flex gap-2 sm:gap-3 md:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
    >
      <div className="flex-shrink-0">
        {msg.role === 'user' ? (
          <div className="size-7 sm:size-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white">
            <User className="size-3.5 sm:size-4" />
          </div>
        ) : (
          <div className="size-7 sm:size-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center relative text-white">
            <Sparkles className="size-3.5 sm:size-4" />
          </div>
        )}
      </div>
      <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
        <div
          className={`${maxWidthClass} px-3 sm:px-4 py-2 sm:py-3 rounded-2xl ${
            msg.role === 'user'
              ? 'rounded-tr-sm bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg shadow-violet-500/20'
              : ASSISTANT_BUBBLE_CLASSES
          }`}
        >
          {msg.role === 'user' ? (
            <>
              {msg.imageUrls?.length ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    {msg.imageUrls.map((filename) => (
                      <img
                        key={filename}
                        src={getUploadSrc(filename)}
                        alt=""
                        loading="lazy"
                        className="max-w-full max-h-48 rounded-lg object-contain bg-black/10"
                      />
                    ))}
                  </div>
                  {msg.body ? <MessageBodyWithMentions body={msg.body} /> : null}
                </div>
              ) : (
                <MessageBodyWithMentions body={msg.body} />
              )}
              <p className="text-xs mt-1.5 sm:mt-2 text-violet-200">
                {formatTime(msg.created_at)}
              </p>
            </>
          ) : (
            <>
              <div
                className="markdown-body prose prose-sm max-w-none dark:prose-invert text-sm sm:text-[14px]"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.body) }}
              />
              {msg.story && msg.story.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Activity
                  </p>
                  <div className="space-y-2">
                    {msg.story
                      .filter((e) => e.type !== 'stream_start')
                      .map((entry) => {
                        const isCommand = entry.type === 'tool_call' && entry.command;
                        const isFile = entry.type === 'file_created' && (entry.path || entry.details);
                        const isThinking =
                          entry.type === 'reasoning_start' && (entry.details ?? '').trim().length > 0;
                        if (isThinking) {
                          return (
                            <div
                              key={entry.id}
                              className="rounded-lg bg-violet-950/30 border border-violet-500/20 px-3 py-2 max-h-40 overflow-y-auto"
                            >
                              <p className="text-[10px] font-semibold text-violet-300/90 uppercase tracking-wide mb-1">
                                Thinking
                              </p>
                              <p className="text-xs text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed break-words">
                                {entry.details ?? ''}
                              </p>
                            </div>
                          );
                        }
                        if (isCommand) {
                          return (
                            <div
                              key={entry.id}
                              className="rounded-lg bg-zinc-900/80 border border-violet-500/20 px-3 py-2 font-mono text-xs text-green-300/95 overflow-x-auto"
                            >
                              <span className="text-violet-400/80 select-none">$ </span>
                              {entry.command}
                            </div>
                          );
                        }
                        if (isFile) {
                          return (
                            <div
                              key={entry.id}
                              className="rounded-lg bg-green-950/20 border border-green-500/20 px-3 py-2 flex items-center gap-2"
                            >
                              <FileCode className="size-3.5 text-green-400 shrink-0" />
                              <span className="text-xs text-foreground/90 font-mono truncate" title={entry.path ?? entry.details}>
                                {entry.path ?? entry.details}
                              </span>
                            </div>
                          );
                        }
                        return (
                          <div key={entry.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                            {entry.type === 'step' ? (
                              <span className="font-medium text-violet-400/90">{entry.message}</span>
                            ) : (
                              <span>{entry.message}</span>
                            )}
                            {entry.details && (
                              <span className="truncate" title={entry.details}>
                                {entry.details}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              <p className="text-xs mt-1.5 sm:mt-2 text-muted-foreground">
                {formatTime(msg.created_at)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export interface MessageListHandle {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export const MessageList = forwardRef<
  MessageListHandle | null,
  {
    messages: ChatMessage[];
    streamingText: string;
    isStreaming: boolean;
    lastUserMessage?: string | null;
    scrollRef?: React.RefObject<HTMLDivElement | null>;
    bothSidebarsCollapsed?: boolean;
  }
>(function MessageList(
  { messages, streamingText, isStreaming, lastUserMessage, scrollRef, bothSidebarsCollapsed },
  ref
) {
  const maxWidthClass = bothSidebarsCollapsed ? FULL_WIDTH : DEFAULT_MAX_WIDTH;
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef?.current ?? null,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    gap: ROW_GAP,
    overscan: 5,
  });

  const virtualItems = scrollRef ? virtualizer.getVirtualItems() : null;
  const totalHeight = scrollRef ? virtualizer.getTotalSize() : 0;
  const lastIndex = messages.length - 1;

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (lastIndex < 0) return;
      virtualizer.scrollToIndex(lastIndex, {
        align: 'end',
        behavior: behavior === 'smooth' ? 'smooth' : 'auto',
      });
    },
    [lastIndex, virtualizer]
  );

  useImperativeHandle(
    ref,
    () => ({ scrollToBottom }),
    [scrollToBottom]
  );

  const hasScrolledToBottomOnMountRef = useRef(false);
  useEffect(() => {
    if (!scrollRef || messages.length === 0 || hasScrolledToBottomOnMountRef.current) return;
    hasScrolledToBottomOnMountRef.current = true;
    const id = requestAnimationFrame(() => {
      if (scrollRef.current) {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'auto' });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [scrollRef, messages.length, virtualizer]);

  const listContent = scrollRef && virtualItems ? (
    <div
      className="w-full relative"
      style={{ height: totalHeight, contain: 'layout paint' } as React.CSSProperties}
    >
      {virtualItems.map((virtualRow) => {
        const msg = messages[virtualRow.index];
        return (
          <div
            key={msg.id ?? `${msg.created_at}-${msg.role}`}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 w-full"
            style={{
              top: virtualRow.start,
              minHeight: virtualRow.size,
            }}
          >
            <MessageRow msg={msg} maxWidthClass={maxWidthClass} />
          </div>
        );
      })}
    </div>
  ) : (
    <div className="space-y-4 sm:space-y-6">
      {messages.map((msg) => (
        <MessageRow
          key={msg.id ?? `${msg.created_at}-${msg.role}`}
          msg={msg}
          maxWidthClass={maxWidthClass}
        />
      ))}
    </div>
  );

  return (
    <>
      {listContent}
      {isStreaming && (
        <div className="flex gap-2 sm:gap-3 md:gap-4">
          <ThinkingAvatar />
          <div className="flex-1 min-w-0">
            <div
              className={`${maxWidthClass} px-4 py-3 ${
                streamingText ? ASSISTANT_BUBBLE_CLASSES : TYPING_BUBBLE_CLASSES
              }`}
            >
              {streamingText ? (
                <div
                  className="markdown-body prose prose-sm max-w-none dark:prose-invert text-sm sm:text-[14px]"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }}
                />
              ) : (
                <ThinkingState lastUserMessage={lastUserMessage} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});
