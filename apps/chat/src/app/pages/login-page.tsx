import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithPassword, isAuthenticated } from '../api-url';
import { FibeLogo } from '../fibe-logo';
import { AUTO_AUTH_SUCCESS_EVENT, waitForAutoAuth } from '../postmessage-auth';
import { useT } from '../i18n';

export function LoginPage() {
  const t = useT();
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
        setError(result.error ?? t('login.authFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  // While waiting for postMessage auto-auth, show a minimal loading state
  if (autoAuthPending) {
    return (
      <div className="w-full h-full min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-primary">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-sm text-primary/60">{t('login.connecting')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-primary relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(92,180,58,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(92,180,58,0.04)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute rounded-full bg-gradient-to-br from-primary/15 to-secondary/15 blur-3xl animate-float"
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
            className="absolute w-0.5 h-0.5 bg-primary/80 rounded-full animate-sparkle"
            style={{
              top: `${(i * 17) % 100}%`,
              left: `${(i * 23) % 100}%`,
              animationDelay: `${(i * 0.3) % 3}s`,
              animationDuration: `${2.5 + (i % 3) * 0.8}s`,
            }}
          />
        ))}
      </div>

      {/* Form — floats directly on the background, no card box */}
      <div className="relative z-10 w-full max-w-sm px-6 flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <FibeLogo className="size-20 sm:size-24 object-contain drop-shadow-[0_0_32px_rgba(121,212,78,0.4)]" />
        </div>

        {error && (
          <div className="w-full p-3 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-3">
          <div>
            <label htmlFor="password" className="block text-xs text-primary/60 mb-2 text-center tracking-wide uppercase">
              {t('login.passwordLabel')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              className="w-full h-12 px-4 rounded-xl text-sm bg-zinc-900/60 border border-primary/20 text-white placeholder:text-primary/25 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-200 backdrop-blur-sm text-center"
              disabled={loading}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-sm font-medium tracking-[0.04em] rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary hover:to-secondary text-white shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t('login.authenticating')}</span>
              </div>
            ) : (
              t('login.login')
            )}
          </button>
        </form>

        <p className="text-[10px] text-primary/30">v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
