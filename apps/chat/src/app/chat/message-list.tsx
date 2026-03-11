import { marked } from 'marked';
import { getApiUrl, getAuthTokenForRequest } from '../api-url';

export interface ChatMessage {
  id?: string;
  role: string;
  body: string;
  created_at: string;
  imageUrls?: string[];
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

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
    </svg>
  );
}

export function MessageList({
  messages,
  streamingText,
  isStreaming,
}: {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
}) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {messages.map((msg) => (
        <div
          key={msg.id ?? `${msg.created_at}-${msg.role}`}
          className={`flex gap-2 sm:gap-3 md:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
        >
          <div className="flex-shrink-0">
            {msg.role === 'user' ? (
              <div className="size-7 sm:size-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white">
                <UserIcon className="size-3.5 sm:size-4" />
              </div>
            ) : (
              <div className="size-7 sm:size-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center relative text-white">
                <SparklesIcon className="size-3.5 sm:size-4" />
              </div>
            )}
          </div>
          <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
            <div
              className={`max-w-[90%] sm:max-w-[85%] md:max-w-[80%] px-3 sm:px-4 py-2 sm:py-3 rounded-2xl ${
                msg.role === 'user'
                  ? 'rounded-tr-sm bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg shadow-violet-500/20'
                  : 'rounded-tl-sm bg-card/60 backdrop-blur-md border border-border/50 shadow-lg text-card-foreground'
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
                      {msg.body ? (
                        <span className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed">{msg.body}</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed">{msg.body}</span>
                  )}
                  <p className="text-[10px] sm:text-xs mt-1.5 sm:mt-2 text-violet-200">
                    {formatTime(msg.created_at)}
                  </p>
                </>
              ) : (
                <>
                  <div
                    className="markdown-body prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.body) }}
                  />
                  <p className="text-[10px] sm:text-xs mt-1.5 sm:mt-2 text-muted-foreground">
                    {formatTime(msg.created_at)}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
      {isStreaming && (
        <div className="flex gap-4">
          <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center relative text-white flex-shrink-0">
            <SparklesIcon className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="max-w-[90%] sm:max-w-[85%] md:max-w-[80%] rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3">
              {streamingText ? (
                <div
                  className="markdown-body prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }}
                />
              ) : (
                <div className="flex gap-1.5">
                  <span className="size-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="size-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="size-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
