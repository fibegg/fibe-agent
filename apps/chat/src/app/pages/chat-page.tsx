import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../api-url';

export function ChatPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  if (!isAuthenticated()) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-800 text-slate-200">
      <header className="p-4 border-b border-slate-700">
        <h1 className="text-lg font-semibold">AI Assistant</h1>
        <p className="text-sm text-slate-400">Connecting...</p>
      </header>
      <main className="flex-1 overflow-auto p-4">
        <p className="text-slate-400">Chat UI will be implemented in the next step.</p>
      </main>
    </div>
  );
}
