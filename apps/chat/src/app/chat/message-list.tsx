import { useVirtualizer } from '@tanstack/react-virtual';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Brain, Clock, RotateCw, Sparkles, User } from 'lucide-react';
import { buildApiUrl, getAuthTokenForRequest } from '../api-url';
import { API_PATH_UPLOADS_BY_FILENAME } from '../api-paths';
import { FileIcon } from '../file-icon';
import { formatCompactInteger } from '../agent-thinking-utils';
import { parseMessageBodyParts, pathDisplayName } from './mention-utils';
import { ThinkingAvatar, ThinkingState } from './thinking-state';
import {
  AVATAR_ASSISTANT,
  AVATAR_USER,
  BUBBLE_ASSISTANT,
  BUBBLE_TYPING,
  BUBBLE_USER,
  PROSE_MESSAGE,
} from '../ui-classes';
import { ASSISTANT_AVATAR_URL, USER_AVATAR_URL } from './chat-avatar';
import { renderMarkdown } from './markdown-cache';

const prismLoaderPromise = import('../file-explorer/prism-loader');

function highlightPrismInElement(container: HTMLElement): void {
  const codes = container.querySelectorAll('pre code[class*="language-"]');
  if (codes.length === 0) return;
  prismLoaderPromise.then((m) => {
    codes.forEach((el) => {
      try {
        m.highlightCodeElement(el as HTMLElement);
      } catch {
        // leave content as plain text if highlighting fails
      }
    });
  });
}

const USER_MESSAGE_MARKDOWN_CLASS = `${PROSE_MESSAGE} [&_p]:inline [&_p]:my-0 [&_ul]:my-1 [&_ol]:my-1 min-w-0`;

function MarkdownWithPrism({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) highlightPrismInElement(ref.current);
  }, [html]);
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function MentionChipIcon({ path }: { path: string }) {
  return <FileIcon pathOrName={path} size={12} className="shrink-0 opacity-90" />;
}

function MessageBodyWithMentions({ body }: { body: string }) {
  const parts = parseMessageBodyParts(body);
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
      {parts.map((part, i) => {
        if (part.type === 'mention') {
          return (
            <span
              key={`${i}-${part.path}`}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium bg-white/20 border border-white/30 text-violet-100 shadow-sm"
              title={part.path}
            >
              <MentionChipIcon path={part.path} />
              <span className="truncate max-w-[120px] sm:max-w-[160px]">{pathDisplayName(part.path)}</span>
            </span>
          );
        }
        if (!part.content) return null;
        return (
          <MarkdownWithPrism key={i} html={renderMarkdown(part.content)} className={USER_MESSAGE_MARKDOWN_CLASS} />
        );
      })}
    </div>
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
  activityId?: string;
  optimistic?: boolean;
  queued?: boolean;
  usage?: { inputTokens: number; outputTokens: number };
  model?: string;
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

function getUploadSrc(filename: string): string {
  const path = buildApiUrl(API_PATH_UPLOADS_BY_FILENAME(filename));
  const token = getAuthTokenForRequest();
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

const ESTIMATED_ROW_HEIGHT = 120;
const ROW_GAP = 24;
const DEFAULT_MAX_WIDTH = 'max-w-[90%] sm:max-w-[85%] md:max-w-[80%]';
const FULL_WIDTH = 'max-w-full';

function isNoOutputMessage(msg: ChatMessage, noOutputBody?: string): boolean {
  return msg.role === 'assistant' && !!noOutputBody && msg.body === noOutputBody;
}

const MessageRow = memo(function MessageRow({
  msg,
  maxWidthClass = DEFAULT_MAX_WIDTH,
  onRetry,
  isNoOutput,
}: {
  msg: ChatMessage;
  maxWidthClass?: string;
  onRetry?: () => void;
  isNoOutput?: boolean;
}) {
  return (
    <div
      className={`flex gap-2 sm:gap-3 md:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
    >
      <div className="flex-shrink-0">
        {msg.role === 'user' ? (
          USER_AVATAR_URL ? (
            <div className={`${AVATAR_USER} overflow-hidden`}>
              <img src={USER_AVATAR_URL} alt="" className="size-full object-cover" />
            </div>
          ) : (
            <div className={AVATAR_USER}>
              <User className="size-3.5 sm:size-4" />
            </div>
          )
        ) : ASSISTANT_AVATAR_URL ? (
          <div className={`${AVATAR_ASSISTANT} overflow-hidden`}>
            <img src={ASSISTANT_AVATAR_URL} alt="" className="size-full object-cover" />
          </div>
        ) : (
          <div className={AVATAR_ASSISTANT}>
            <Sparkles className="size-3.5 sm:size-4" />
          </div>
        )}
      </div>
      <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
        <div
          className={`${maxWidthClass} px-3 sm:px-4 py-2 sm:py-3 rounded-2xl ${
            msg.role === 'user' ? `rounded-tr-sm ${BUBBLE_USER}` : BUBBLE_ASSISTANT
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
              <p className="text-xs mt-1.5 sm:mt-2 text-violet-200 flex items-center gap-1.5">
                {formatTime(msg.created_at)}
                {msg.queued && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[10px] font-medium leading-none">
                    <Clock className="size-2.5" aria-hidden />
                    Queued
                  </span>
                )}
              </p>
            </>
          ) : (
            <>
              <MarkdownWithPrism html={renderMarkdown(msg.body)} className={PROSE_MESSAGE} />
              {isNoOutput && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium bg-background/80 hover:bg-background border border-border text-foreground"
                >
                  <RotateCw className="size-3.5" aria-hidden />
                  Retry
                </button>
              )}
              <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 min-h-[1.25rem]">
                <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {formatTime(msg.created_at)}
                  {msg.usage && (
                    <span className="tabular-nums">
                      {formatCompactInteger(msg.usage.inputTokens)} in / {formatCompactInteger(msg.usage.outputTokens)} out
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 leading-none" title={msg.model ? `Processed by ${msg.model}` : undefined}>
                  <Brain className="size-3 shrink-0" aria-hidden />
                  {msg.model ?? '—'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export interface MessageListHandle {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  lastUserMessage?: string | null;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  bothSidebarsCollapsed?: boolean;
  noOutputBody?: string;
  onRetry?: () => void;
}

export const MessageList = forwardRef<MessageListHandle | null, MessageListProps>(function MessageList(
  {
    messages,
    streamingText,
    isStreaming,
    lastUserMessage,
    scrollRef,
    bothSidebarsCollapsed,
    noOutputBody,
    onRetry,
  },
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
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || !scrollRef.current) return;
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'auto' });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [scrollRef, messages.length, virtualizer]);

  const listContent = scrollRef && virtualItems ? (
    <div
      className="w-full relative"
      style={{ height: totalHeight, contain: 'layout paint' } as React.CSSProperties}
    >
      {virtualItems.map((virtualRow) => {
        const msg = messages[virtualRow.index];
        const rowKey = msg.id ?? `msg-${virtualRow.index}-${msg.created_at}-${msg.role}`;
        return (
          <div
            key={rowKey}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 w-full"
            style={{
              top: virtualRow.start,
              minHeight: virtualRow.size,
            }}
          >
            <MessageRow
              msg={msg}
              maxWidthClass={maxWidthClass}
              isNoOutput={isNoOutputMessage(msg, noOutputBody)}
              onRetry={onRetry}
            />
          </div>
        );
      })}
    </div>
  ) : (
    <div className="space-y-4 sm:space-y-6">
      {messages.map((msg, i) => (
        <MessageRow
          key={msg.id ?? `msg-${i}-${msg.created_at}-${msg.role}`}
          msg={msg}
          maxWidthClass={maxWidthClass}
          isNoOutput={isNoOutputMessage(msg, noOutputBody)}
          onRetry={onRetry}
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
                streamingText ? BUBBLE_ASSISTANT : BUBBLE_TYPING
              }`}
            >
              {streamingText ? (
                <MarkdownWithPrism html={renderMarkdown(streamingText)} className={PROSE_MESSAGE} />
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
