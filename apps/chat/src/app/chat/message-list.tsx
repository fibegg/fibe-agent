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
    <div className="space-y-4">
      {messages.map((msg) => (
        <div
          key={msg.id ?? `${msg.created_at}-${msg.role}`}
          className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
        >
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
              msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {msg.role === 'user' ? 'U' : '◆'}
          </div>
          <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'text-right' : ''}`}>
            <div
              className={`inline-block max-w-full px-3 py-2 rounded-lg shadow-soft ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-card-foreground'
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
                            className="max-w-full max-h-48 rounded object-contain bg-black/10"
                          />
                        ))}
                      </div>
                      {msg.body ? (
                        <span className="whitespace-pre-wrap">{msg.body}</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.body}</span>
                  )}
                </>
              ) : (
                <div
                  className="markdown-body prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.body) }}
                />
              )}
            </div>
            <div className={`text-xs text-muted-foreground mt-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
              {formatTime(msg.created_at)}
            </div>
          </div>
        </div>
      ))}
      {isStreaming && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm">
            ◆
          </div>
          <div className="flex-1 min-w-0">
            <div className="inline-block max-w-full px-3 py-2 rounded-lg bg-card border border-border text-card-foreground shadow-soft">
              {streamingText ? (
                <div
                  className="markdown-body prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }}
                />
              ) : (
                <span className="text-muted-foreground">Thinking...</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
