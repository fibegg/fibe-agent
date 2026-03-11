import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../theme-toggle';
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-violet-950 to-slate-900 relative overflow-hidden p-4">
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
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <h2 className="text-xl sm:text-2xl font-semibold text-white mb-6 tracking-tight">
          Phoenix Chat
        </h2>
        <div className="w-full bg-slate-800/40 dark:bg-slate-900/50 backdrop-blur-2xl border border-violet-500/20 rounded-2xl shadow-[0_0_50px_rgba(139,92,246,0.2)] p-6 sm:p-8">
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
            <ThemeToggle />
          </div>

          <div className="flex justify-center mb-4 sm:mb-6">
            <img
              src="https://spider-ardent-96875346.figma.site/_assets/v11/983ab7ca00b487dee5d894129bffdbec7233e5d0.png"
              alt="Phoenix"
              className="size-16 sm:size-20 object-contain drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
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
                className="w-full h-10 sm:h-11 px-4 rounded-lg text-sm bg-slate-900/50 border border-violet-500/20 text-white placeholder:text-violet-300/30 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 sm:h-11 text-sm font-medium rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/30 transition-all duration-300 hover:shadow-violet-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </span>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <p className="mt-4 sm:mt-6 text-center text-[10px] sm:text-xs text-violet-300/40">
            Protected by Quantum Encryption • Phoenix v2.4.1
          </p>
        </div>
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
