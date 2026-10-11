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
  const [autoAuthPending, setAutoAuthPending] = useState(
    window !== window.parent,
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (window === window.parent) return;
    const handleAutoAuthSuccess = () => navigate('/', { replace: true });
    window.addEventListener(AUTO_AUTH_SUCCESS_EVENT, handleAutoAuthSuccess);

    if (isAuthenticated()) {
      navigate('/', { replace: true });
      return () =>
        window.removeEventListener(
          AUTO_AUTH_SUCCESS_EVENT,
          handleAutoAuthSuccess,
        );
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
      window.removeEventListener(
        AUTO_AUTH_SUCCESS_EVENT,
        handleAutoAuthSuccess,
      );
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
      <div className="w-full h-full min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">
              {t('login.connecting')}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Form: floats directly on the background, no card box */}
      <div className="relative z-10 w-full max-w-sm px-6 flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <FibeLogo className="size-20 sm:size-24 object-contain" />
        </div>

        {error && (
          <div className="w-full p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-3">
          <div>
            <label
              htmlFor="password"
              className="block text-xs text-muted-foreground mb-2 text-center tracking-wide uppercase"
            >
              {t('login.passwordLabel')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              className="w-full h-12 px-4 rounded-md text-sm bg-input-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-200 text-center"
              disabled={loading}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-sm font-medium tracking-[0.04em] rounded-md bg-primary text-primary-foreground shadow-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                <span>{t('login.authenticating')}</span>
              </div>
            ) : (
              t('login.login')
            )}
          </button>
        </form>

        <p className="text-[10px] text-muted-foreground">v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
