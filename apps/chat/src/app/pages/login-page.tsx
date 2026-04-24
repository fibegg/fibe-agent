import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithPassword, isAuthenticated } from '../api-url';
import { FibeLogo } from '../fibe-logo';
import { AUTO_AUTH_SUCCESS_EVENT, waitForAutoAuth } from '../postmessage-auth';

export function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoAuthPending, setAutoAuthPending] = useState(window !== window.parent);
  const navigate = useNavigate();

  useEffect(() => {
    if (window === window.parent) return;
    const handleAutoAuthSuccess = () => navigate('/', { replace: true });
    window.addEventListener(AUTO_AUTH_SUCCESS_EVENT, handleAutoAuthSuccess);

    if (isAuthenticated()) {
      navigate('/', { replace: true });
      return () => window.removeEventListener(AUTO_AUTH_SUCCESS_EVENT, handleAutoAuthSuccess);
    }

    let cancelled = false;
    void (async () => {
      const success = await waitForAutoAuth();
      if (cancelled) return;
      setAutoAuthPending(false);
      if (success) navigate('/', { replace: true });
    })();
    return () => {
      cancelled = true;
      window.removeEventListener(AUTO_AUTH_SUCCESS_EVENT, handleAutoAuthSuccess);
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await loginWithPassword(password);
      if (result.success) {
        navigate('/', { replace: true });
      } else {
        setError(result.error ?? 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // While waiting for postMessage auto-auth, show a minimal loading state
  if (autoAuthPending) {
    return (
      <div className="w-full h-full min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-violet-950">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-sm text-violet-300/60">Connecting...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-violet-950 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(124,58,237,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(124,58,237,0.04)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute rounded-full bg-gradient-to-br from-violet-700/15 to-purple-900/15 blur-3xl animate-float"
            style={{
              width: `${220 + i * 80}px`,
              height: `${220 + i * 80}px`,
              top: `${15 + i * 25}%`,
              left: `${10 + (i % 3) * 35}%`,
              animationDelay: `${i * 1.2}s`,
              animationDuration: `${10 + i * 3}s`,
            }}
          />
        ))}
        {[...Array(8)].map((_, i) => (
          <div
            key={`sparkle-${i}`}
            className="absolute w-0.5 h-0.5 bg-violet-400/80 rounded-full animate-sparkle"
            style={{
              top: `${(i * 17) % 100}%`,
              left: `${(i * 23) % 100}%`,
              animationDelay: `${(i * 0.3) % 3}s`,
              animationDuration: `${2.5 + (i % 3) * 0.8}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-zinc-800/30 backdrop-blur-3xl border border-violet-400/15 rounded-2xl shadow-[0_0_60px_rgba(124,58,237,0.12)] p-6 sm:p-8">
          <div className="flex justify-center mb-4 sm:mb-6">
            <FibeLogo className="size-16 sm:size-20 object-contain" />
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
                className="w-full h-11 sm:h-12 px-4 rounded-xl text-sm bg-zinc-900/40 border border-violet-500/15 text-white placeholder:text-violet-300/25 focus:outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/20 transition-all duration-200"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 sm:h-12 text-sm font-medium tracking-[0.04em] rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg shadow-violet-500/25 transition-all duration-300 hover:shadow-violet-500/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-xs sm:text-sm">Authenticating...</span>
                </div>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <div className="mt-4 sm:mt-6 text-center">
            <p className="text-[10px] sm:text-xs text-violet-300/40">
              v{__APP_VERSION__}
            </p>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-violet-600/20 to-transparent blur-3xl -z-10 scale-150" />
      </div>
    </div>
  );
}
