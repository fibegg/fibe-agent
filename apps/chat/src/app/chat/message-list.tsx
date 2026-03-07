import { marked } from 'marked';

export interface ChatMessage {
  id?: string;
  role: string;
  body: string;
  created_at: string;
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
              msg.role === 'user' ? 'bg-indigo-600' : 'bg-slate-600'
            }`}
          >
            {msg.role === 'user' ? 'U' : '◆'}
          </div>
          <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'text-right' : ''}`}>
            <div
              className={`inline-block max-w-full px-3 py-2 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-indigo-600/80 text-white'
                  : 'bg-slate-700 text-slate-200'
              }`}
            >
              {msg.role === 'user' ? (
                <span className="whitespace-pre-wrap">{msg.body}</span>
              ) : (
                <div
                  className="prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.body) }}
                />
              )}
            </div>
            <div className={`text-xs text-slate-500 mt-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
              {formatTime(msg.created_at)}
            </div>
          </div>
        </div>
      ))}
      {isStreaming && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-sm">
            ◆
          </div>
          <div className="flex-1 min-w-0">
            <div className="inline-block max-w-full px-3 py-2 rounded-lg bg-slate-700 text-slate-200">
              {streamingText ? (
                <div
                  className="prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }}
                />
              ) : (
                <span className="text-slate-400">Thinking...</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
