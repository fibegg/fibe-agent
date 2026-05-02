import { useVirtualizer } from '@tanstack/react-virtual';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Brain, Check, Clock, Copy, RefreshCcw, RotateCw, Sparkles, User, Play, Square } from 'lucide-react';
import { buildApiUrl, getAuthTokenForRequest } from '../api-url';
import { useLocalTts } from './use-local-tts';
import { API_PATH_UPLOADS_BY_FILENAME } from '@shared/api-paths';
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
import { useAvatarConfig } from '../avatar-config-context';

import {
  normalizeBarePreElementsInContainer,
  stringHash32,
  wrapBarePreElementsInHtmlString,
} from './markdown-bare-pre';
import { renderMarkdown } from './markdown-cache';
import { prepareUserMessageMarkdownForRender } from './user-markdown-prep';
import { estimateMessageHeight, estimateStreamingHeight, computeTightBubbleWidth } from './pretext-height';
import { useI18n } from '../i18n';

let prismLoaderPromise: Promise<typeof import('../file-explorer/prism-loader')> | null = null;

function getPrismLoader() {
  if (!prismLoaderPromise) {
    prismLoaderPromise = import('../file-explorer/prism-loader');
  }
  return prismLoaderPromise;
}

const PRISM_LANG_LABEL: Record<string, string> = {
  none: 'Plain text',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  javascript: 'JavaScript',
  js: 'JavaScript',
  tsx: 'TSX',
  jsx: 'JSX',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  python: 'Python',
  py: 'Python',
  bash: 'Bash',
  sh: 'Shell',
  rust: 'Rust',
  go: 'Go',
  css: 'CSS',
  html: 'HTML',
  sql: 'SQL',
};

function annotateChatCodeBlockLabels(root: HTMLElement): void {
  root.querySelectorAll('pre > code[class*="language-"]').forEach((el) => {
    const code = el as HTMLElement;
    const pre = code.parentElement;
    if (!pre || pre.tagName !== 'PRE') return;
    const m = /(?:^|\s)language-([\w-]+)/.exec(code.className);
    const id = m?.[1]?.toLowerCase() ?? '';
    if (!id) return;
    pre.setAttribute(
      'data-code-lang',
      PRISM_LANG_LABEL[id] ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' ')
    );
  });
}

function schedulePrismHighlightForRoot(root: HTMLElement, shouldAbort: () => boolean): void {
  getPrismLoader().then((m) => {
    if (shouldAbort() || !root.isConnected) return;
    for (const el of root.querySelectorAll('pre code')) {
      if (shouldAbort() || !root.isConnected) return;
      try {
        m.highlightCodeElement(el as HTMLElement);
      } catch {
        /* keep plain text */
      }
    }
  });
}

const USER_MESSAGE_MARKDOWN_CLASS = `${PROSE_MESSAGE} chat-user-markdown-body [&_p]:inline [&_p]:my-0 [&_ul]:my-1 [&_ol]:my-1 min-w-0 [&_.markdown-body]:min-w-0 [&_pre]:block [&_pre]:w-full [&_pre]:min-w-0 [&_pre]:shrink-0 [&_pre]:basis-full [&_pre]:bg-background [&_pre]:text-foreground [&_pre]:border-border [&_pre_code]:text-foreground [&_pre]:mt-2`;

const COPY_SUCCESS_FEEDBACK_MS = 2000;

const COPY_BUTTON_CLASS_USER =
  'inline-flex shrink-0 items-center justify-center rounded-md p-1 text-violet-200/90 hover:text-violet-50 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-200/50';
const COPY_BUTTON_CLASS_ASSISTANT =
  'inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';

function CopyRawMessageButton({
  rawText,
  visualVariant,
}: {
  rawText: string;
  visualVariant: 'user' | 'assistant';
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const handleClick = useCallback(async () => {
    if (!rawText) return;
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      clearTimer();
      timeoutRef.current = setTimeout(() => setCopied(false), COPY_SUCCESS_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  }, [rawText, clearTimer]);

  if (!rawText) return null;

  const btnClass =
    visualVariant === 'user' ? COPY_BUTTON_CLASS_USER : COPY_BUTTON_CLASS_ASSISTANT;

  const idleLabel = visualVariant === 'user' ? t('message.copyRawUser') : t('message.copyRawAssistant');
  const copiedLabel = t('common.copied');

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className={btnClass}
      title={copied ? copiedLabel : idleLabel}
      aria-label={copied ? copiedLabel : idleLabel}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

const MarkdownWithPrism = memo(
  function MarkdownWithPrism({
    html,
    className,
    codeLangBadge,
  }: {
    html: string;
    className?: string;
    codeLangBadge?: boolean;
  }) {
    const ref = useRef<HTMLDivElement>(null);
    const htmlForDom = useMemo(() => wrapBarePreElementsInHtmlString(html), [html]);
    useLayoutEffect(() => {
      if (!ref.current) return;
      const root = ref.current;
      let cancelled = false;
      const shouldAbort = () => cancelled;
      normalizeBarePreElementsInContainer(root);
      if (codeLangBadge) annotateChatCodeBlockLabels(root);
      schedulePrismHighlightForRoot(root, shouldAbort);
      return () => {
        cancelled = true;
      };
    }, [htmlForDom, codeLangBadge]);
    return (
      <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: htmlForDom }} />
    );
  },
  (prev, next) =>
    prev.html === next.html &&
    prev.className === next.className &&
    prev.codeLangBadge === next.codeLangBadge
);

function userMessageMarkdownPartKey(index: number, content: string): string {
  return `umd-${index}-${content.length}-${stringHash32(content)}`;
}

function MentionChipIcon({ path }: { path: string }) {
  return <FileIcon pathOrName={path} size={12} className="shrink-0 opacity-90" />;
}

function MessageBodyWithMentions({ body, messageId }: { body: string; messageId?: string }) {
  const parts = parseMessageBodyParts(body);
  return (
    <div className="flex w-full min-w-0 flex-wrap items-start gap-x-1.5 gap-y-1">
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
          <MarkdownWithPrism
            key={userMessageMarkdownPartKey(i, part.content)}
            html={renderMarkdown(prepareUserMessageMarkdownForRender(part.content), messageId ? `user-${messageId}-${i}` : undefined)}
            className={USER_MESSAGE_MARKDOWN_CLASS}
            codeLangBadge
          />
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

/** Sentinel inserted into the message list when a conversation reset happens. */
export interface ConversationResetSeparator {
  kind: 'reset_separator';
  resetAt: string;
}

export type ChatListItem = ChatMessage | ConversationResetSeparator;

function isResetSeparator(item: ChatListItem): item is ConversationResetSeparator {
  return (item as ConversationResetSeparator).kind === 'reset_separator';
}

function ResetSeparatorRow({ resetAt }: { resetAt: string }) {
  const { locale, t } = useI18n();
  const d = new Date(resetAt);
  const label = d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <div className="flex items-center gap-3 py-2 select-none" role="separator" aria-label={t('message.resetOn', { time: label })}>
      <div className="flex-1 h-px bg-border/40" />
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60 whitespace-nowrap">
        <RefreshCcw className="size-3 shrink-0" aria-hidden />
        {t('message.resetBefore', { time: label })}
      </span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function getUploadSrc(filename: string): string {
  const path = buildApiUrl(API_PATH_UPLOADS_BY_FILENAME(filename));
  const token = getAuthTokenForRequest();
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

const ROW_GAP = 28;
const DEFAULT_MAX_WIDTH = 'max-w-[90%] sm:max-w-[85%] md:max-w-[80%]';
const FULL_WIDTH = 'max-w-full';
/**
 * Fraction of the scroll-container width used as the bubble width for
 * estimating text-wrap line count via Pretext.js.
 */
const BUBBLE_WIDTH_FRACTION = 0.8;
/**
 * Minimum character growth before the streaming bubble height is recalculated.
 * Avoids a full layout() pass on every 16 ms animation frame during streaming.
 */
const STREAMING_HEIGHT_THROTTLE_CHARS = 80;

function isNoOutputMessage(msg: ChatMessage, noOutputBody?: string): boolean {
  return msg.role === 'assistant' && !!noOutputBody && msg.body === noOutputBody;
}

const MessageRow = memo(
  function MessageRow({
    msg,
    maxWidthClass = DEFAULT_MAX_WIDTH,
    onRetry,
    isNoOutput,
    containerWidthPx,
    onPlay,
    playingId,
  }: {
    msg: ChatMessage;
    maxWidthClass?: string;
    onRetry?: () => void;
    isNoOutput?: boolean;
    /** Scroll-container pixel width — used to compute tight bubble widths. */
    containerWidthPx?: number;
    onPlay?: (id: string, text: string) => void;
    playingId?: string | null;
  }) {
    const { locale, t } = useI18n();
    const { userAvatarUrl, assistantAvatarUrl } = useAvatarConfig();

    // Compute tight bubble width for plain short user messages.
    // Skip when: role is assistant, message has images, message has code blocks,
    // or we have no container measurement yet.
    const tightMaxWidth =
      msg.role === 'user' &&
      !(msg.imageUrls?.length) &&
      !msg.body.includes('```') &&
      containerWidthPx
        ? computeTightBubbleWidth(msg.body, containerWidthPx * BUBBLE_WIDTH_FRACTION)
        : undefined;

    return (
    <div
      className={`flex gap-2 sm:gap-3 md:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
    >
      <div className="flex-shrink-0">
        {msg.role === 'user' ? (
          userAvatarUrl ? (
            <div className={`${AVATAR_USER} overflow-hidden`}>
              <img src={userAvatarUrl} alt="" className="size-full object-cover" />
            </div>
          ) : (
            <div className={AVATAR_USER}>
              <User className="size-3.5 sm:size-4" />
            </div>
          )
        ) : assistantAvatarUrl ? (
          <div className={`${AVATAR_ASSISTANT} overflow-hidden`}>
            <img src={assistantAvatarUrl} alt="" className="size-full object-cover" />
          </div>
        ) : (
          <div className={AVATAR_ASSISTANT}>
            <Sparkles className="size-3.5 sm:size-4" />
          </div>
        )}
      </div>
      <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
        <div
          className={`${maxWidthClass} min-w-0 px-3 sm:px-4 py-2 sm:py-3 rounded-2xl ${
            msg.role === 'user' ? `rounded-tr-sm ${BUBBLE_USER}` : BUBBLE_ASSISTANT
          }`}
          style={tightMaxWidth !== undefined ? { maxWidth: tightMaxWidth } : undefined}
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
                <MessageBodyWithMentions body={msg.body} messageId={msg.id} />
              )}
              <div className="text-xs mt-1.5 sm:mt-2 text-violet-200 flex items-center justify-between gap-2 min-h-[1.25rem]">
                <p className="flex flex-wrap items-center gap-1.5 min-w-0">
                  {formatTime(msg.created_at, locale)}
                  {msg.queued && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-400/20 border border-amber-400/30 text-violet-300 text-[10px] font-medium leading-none">
                      <Clock className="size-2.5" aria-hidden />
                      {t('message.queued')}
                    </span>
                  )}
                </p>
                <CopyRawMessageButton rawText={msg.body} visualVariant="user" />
              </div>
            </>
          ) : (
            <>
              <MarkdownWithPrism html={renderMarkdown(msg.body, msg.id ? `assistant-${msg.id}` : undefined)} className={PROSE_MESSAGE} />
              {isNoOutput && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium bg-background/80 hover:bg-background border border-border text-foreground"
                >
                  <RotateCw className="size-3.5" aria-hidden />
                  {t('common.retry')}
                </button>
              )}
              <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 min-h-[1.25rem]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                  <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {formatTime(msg.created_at, locale)}
                    {msg.usage && (
                      <span className="tabular-nums">
                        {formatCompactInteger(msg.usage.inputTokens)} {t('header.inputShort')} / {formatCompactInteger(msg.usage.outputTokens)} {t('header.outputShort')}
                      </span>
                    )}
                  </p>
                  <CopyRawMessageButton rawText={msg.body} visualVariant="assistant" />
                  {msg.id && onPlay && (
                    <button
                      type="button"
                      onClick={() => msg.id && onPlay(msg.id, msg.body)}
                      className={COPY_BUTTON_CLASS_ASSISTANT}
                      title={playingId === msg.id ? t('message.stopVoice') : t('message.readAloud')}
                      aria-label={playingId === msg.id ? t('message.stopVoice') : t('message.readAloud')}
                    >
                      {playingId === msg.id ? <Square className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
                    </button>
                  )}
                </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 leading-none opacity-70" title={msg.model ? t('message.processedBy', { model: msg.model }) : undefined}>
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
  },
  // Custom memo comparator: include containerWidthPx in the shallow check
  // only when it affects tight-width calculations (simple user messages).
  (prev, next) => {
    if (
      prev.msg !== next.msg ||
      prev.maxWidthClass !== next.maxWidthClass ||
      prev.onRetry !== next.onRetry ||
      prev.isNoOutput !== next.isNoOutput ||
      prev.onPlay !== next.onPlay ||
      prev.playingId !== next.playingId
    ) {
      return false;
    }
    const needsTightWidth = prev.msg.role === 'user' && !prev.msg.imageUrls?.length && !prev.msg.body.includes('```');
    return needsTightWidth ? prev.containerWidthPx === next.containerWidthPx : true;
  }
);

export interface MessageListHandle {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export interface MessageListProps {
  messages: ChatListItem[];
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

  // Read the scroll-container pixel width for tight-bubble computation.
  // TanStack Virtual already uses a ResizeObserver internally — when the
  // container resizes, the virtualizer re-renders, which re-reads this value.
  const containerWidthPx = scrollRef?.current?.clientWidth ?? 640;

  const localTts = useLocalTts();
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Keep a ref so the stable wrapper below never captures a stale closure.
  const playingIdRef = useRef(playingId);
  playingIdRef.current = playingId;
  const localTtsRef = useRef(localTts);
  localTtsRef.current = localTts;

  // Stable identity — never changes, so MessageRow memo is not invalidated
  // when playingId changes on an unrelated row.
  const handlePlay = useCallback((id: string, text: string) => {
    const tts = localTtsRef.current;
    if (playingIdRef.current === id) {
      tts.stop();
      setPlayingId(null);
    } else {
      tts.stop();
      setPlayingId(id);
      tts.speak(text).finally(() => {
        setPlayingId((curr) => curr === id ? null : curr);
      });
    }
  }, []);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef?.current ?? null,
    estimateSize: (index) => {
      const item = messages[index];
      if (isResetSeparator(item)) return 48;
      const bubbleWidth = containerWidthPx * BUBBLE_WIDTH_FRACTION;
      return estimateMessageHeight(item.body, bubbleWidth, {
        hasCode: item.body.includes('```'),
      });
    },
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
      style={{ height: totalHeight, contain: 'layout' } as React.CSSProperties}
    >
      {virtualItems.map((virtualRow) => {
        const item = messages[virtualRow.index];
        if (isResetSeparator(item)) {
          const rowKey = `reset-${item.resetAt}-${virtualRow.index}`;
          return (
            <div
              key={rowKey}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 w-full"
              style={{ top: virtualRow.start, minHeight: virtualRow.size }}
            >
              <ResetSeparatorRow resetAt={item.resetAt} />
            </div>
          );
        }
        const rowKey = item.id ?? `msg-${virtualRow.index}-${item.created_at}-${item.role}`;
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
              msg={item}
              maxWidthClass={maxWidthClass}
              isNoOutput={isNoOutputMessage(item, noOutputBody)}
              onRetry={onRetry}
              containerWidthPx={containerWidthPx}
              onPlay={handlePlay}
              playingId={playingId}
            />
          </div>
        );
      })}
    </div>
  ) : (
    <div className="space-y-4 sm:space-y-6">
      {messages.map((item, i) => {
        if (isResetSeparator(item)) {
          return <ResetSeparatorRow key={`reset-${item.resetAt}-${i}`} resetAt={item.resetAt} />;
        }
        return (
          <MessageRow
            key={item.id ?? `msg-${i}-${item.created_at}-${item.role}`}
            msg={item}
            maxWidthClass={maxWidthClass}
            isNoOutput={isNoOutputMessage(item, noOutputBody)}
            onRetry={onRetry}
            containerWidthPx={containerWidthPx}
            onPlay={handlePlay}
            playingId={playingId}
          />
        );
      })}
    </div>
  );

  // Reserve vertical space for the streaming bubble proportional to the
  // current text flow, preventing abrupt container-height jumps on each flush.
  // Throttled: recompute only when text grows by ≥ STREAMING_HEIGHT_THROTTLE_CHARS
  // since the last computation, cutting layout() calls by ~5× during streaming.
  const streamingHeightLenRef = useRef<number | null>(null);
  const streamingHeightCacheRef = useRef<number | undefined>(undefined);

  const streamingBubbleMinHeight = useMemo(() => {
    if (!isStreaming || !streamingText) {
      streamingHeightLenRef.current = null;
      streamingHeightCacheRef.current = undefined;
      return undefined;
    }
    const len = streamingText.length;
    const lastLen = streamingHeightLenRef.current;
    if (lastLen !== null && Math.abs(len - lastLen) < STREAMING_HEIGHT_THROTTLE_CHARS) {
      // Not enough new text to justify a full layout pass — reuse cached value.
      return streamingHeightCacheRef.current;
    }
    streamingHeightLenRef.current = len;
    const bubbleWidth = containerWidthPx * BUBBLE_WIDTH_FRACTION;
    const h = estimateStreamingHeight(streamingText, bubbleWidth);
    streamingHeightCacheRef.current = h;
    return h;
  }, [isStreaming, streamingText, containerWidthPx]);

  return (
    <>
      {listContent}
      {isStreaming && (
        <div className={`flex gap-2 sm:gap-3 md:gap-4 ${messages.length > 0 ? "mt-7" : ""}`}>
          <ThinkingAvatar />
          <div className="flex-1 min-w-0">
            <div
              className={`${maxWidthClass} min-w-0 px-4 py-3 transition-[min-height] duration-100 ${
                streamingText ? BUBBLE_ASSISTANT : BUBBLE_TYPING
              }`}
              style={streamingBubbleMinHeight !== undefined ? { minHeight: streamingBubbleMinHeight } : undefined}
            >
              {streamingText ? (
                <>
                  <MarkdownWithPrism html={renderMarkdown(streamingText, 'streaming-message')} className={PROSE_MESSAGE} />
                  <div className="mt-2 flex justify-end">
                    <CopyRawMessageButton rawText={streamingText} visualVariant="assistant" />
                  </div>
                </>
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
