import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatWebSocket } from '../chat/use-chat-websocket';
import { CHAT_STATES } from '../chat/chat-state';
import { isAuthenticated } from '../api-url';

const STATE_LABELS: Record<string, string> = {
  [CHAT_STATES.INITIALIZING]: 'Connecting...',
  [CHAT_STATES.AGENT_OFFLINE]: 'Agent offline',
  [CHAT_STATES.UNAUTHENTICATED]: 'Authentication required',
  [CHAT_STATES.AUTH_PENDING]: 'Authentication in progress...',
  [CHAT_STATES.AUTHENTICATED]: 'Ready to help',
  [CHAT_STATES.AWAITING_RESPONSE]: 'Working...',
  [CHAT_STATES.LOGGING_OUT]: 'Logging out...',
  [CHAT_STATES.ERROR]: 'Error occurred',
};

export function ChatPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const {
    state,
    errorMessage,
    send,
    startAuth,
    reauthenticate,
    logout,
    dismissError,
  } = useChatWebSocket();

  if (!isAuthenticated()) {
    return null;
  }

  const statusClass =
    state === CHAT_STATES.AUTHENTICATED
      ? 'text-green-400'
      : state === CHAT_STATES.ERROR
        ? 'text-red-400'
        : 'text-amber-400';

  return (
    <div className="min-h-screen flex flex-col bg-slate-800 text-slate-200">
      <header className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h1 className="text-lg font-semibold">AI Assistant</h1>
          <p className={`text-sm ${statusClass}`}>{STATE_LABELS[state] ?? state}</p>
        </div>
        <div className="flex gap-2">
          {(state === CHAT_STATES.UNAUTHENTICATED || state === CHAT_STATES.AUTHENTICATED) && (
            <button
              type="button"
              onClick={state === CHAT_STATES.UNAUTHENTICATED ? startAuth : reauthenticate}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm"
            >
              {state === CHAT_STATES.UNAUTHENTICATED ? 'Start Auth' : 'Reauthenticate'}
            </button>
          )}
          {(state === CHAT_STATES.AUTHENTICATED || state === CHAT_STATES.AWAITING_RESPONSE) && (
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-sm"
            >
              Logout
            </button>
          )}
        </div>
      </header>

      {errorMessage && state === CHAT_STATES.ERROR && (
        <div className="flex items-center justify-between px-4 py-2 bg-red-900/30 border-b border-red-800">
          <span className="text-red-200 text-sm">{errorMessage}</span>
          <button
            type="button"
            onClick={dismissError}
            className="text-slate-400 hover:text-white text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-slate-400 text-sm">
            Messages and streaming will appear here (next step).
          </p>
        </div>
      </main>

      <div className="p-4 border-t border-slate-700">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            className="flex-1 min-h-[44px] max-h-32 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 placeholder-slate-400 resize-y disabled:opacity-50"
            placeholder={
              state === CHAT_STATES.AUTHENTICATED
                ? 'Ask me anything...'
                : 'Complete authentication to start chatting...'
            }
            rows={2}
            disabled={state !== CHAT_STATES.AUTHENTICATED}
          />
          <button
            type="button"
            disabled={state !== CHAT_STATES.AUTHENTICATED}
            className="px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
