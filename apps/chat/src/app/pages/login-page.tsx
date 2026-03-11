import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatedPhoenixLogo } from '../animated-phoenix-logo';
import { getApiUrl, setToken } from '../api-url';

export function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const base = getApiUrl();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = base ? `${base}/api/login` : '/api/login';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { success?: boolean; token?: string; error?: string };
      if (res.ok && data.success) {
        setToken(data.token ?? '');
        navigate('/', { replace: true });
      } else {
        setError(data.error ?? 'Authentication failed');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen h-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-violet-950 to-slate-900 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="absolute rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 blur-3xl animate-float"
            style={{
              width: `${200 + i * 60}px`,
              height: `${200 + i * 60}px`,
              top: `${15 + i * 18}%`,
              left: `${10 + (i % 3) * 35}%`,
              animationDelay: `${i * 0.7}s`,
              animationDuration: `${8 + i * 2}s`,
            }}
          />
        ))}
        {[...Array(20)].map((_, i) => (
          <div
            key={`sparkle-${i}`}
            className="absolute w-1 h-1 bg-violet-400 rounded-full animate-sparkle"
            style={{
              top: `${(i * 17) % 100}%`,
              left: `${(i * 23) % 100}%`,
              animationDelay: `${(i * 0.15) % 3}s`,
              animationDuration: `${2 + (i % 3) * 0.5}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <h2 className="text-xl sm:text-2xl font-semibold text-white mb-6 tracking-tight text-center">
          Phoenix Chat
        </h2>
        <div className="bg-slate-800/40 backdrop-blur-2xl border border-violet-500/20 rounded-2xl shadow-[0_0_50px_rgba(139,92,246,0.3)] p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-violet-500/10 rounded-lg border border-violet-500/20">
                  <KeyIcon className="size-4 sm:size-5 text-violet-400" />
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-semibold text-white">
                    Agent Authentication
                  </h1>
                  <p className="text-[10px] sm:text-xs text-violet-300/60">
                    Quantum Storage Access
                  </p>
                </div>
              </div>
              <div className="p-1.5 sm:p-2 bg-violet-500/5 rounded-lg border border-violet-500/10">
                <SparklesIcon className="size-3 sm:size-4 text-violet-400/50" />
              </div>
            </div>

            <div className="flex justify-center mb-4 sm:mb-6">
              <AnimatedPhoenixLogo className="size-16 sm:size-20" />
            </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label htmlFor="password" className="block text-xs sm:text-sm text-violet-300/80 mb-2">
                Playground Internal Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to continue"
                className="w-full h-10 sm:h-11 px-4 rounded-md text-sm bg-slate-900/50 border border-violet-500/20 text-white placeholder:text-violet-300/30 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 sm:h-11 text-sm font-medium rounded-md bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/30 transition-all duration-300 hover:shadow-violet-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-xs sm:text-sm">Authenticating...</span>
                </span>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <div className="mt-4 sm:mt-6 text-center">
            <p className="text-[10px] sm:text-xs text-violet-300/40">
              Protected by Quantum Encryption • Phoenix v2.4.1
            </p>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-violet-500/20 to-transparent blur-3xl -z-10 scale-150" />
      </div>
    </div>
  );
}


function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}
