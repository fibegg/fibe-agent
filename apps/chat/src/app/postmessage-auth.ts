import { getApiUrl, setToken, isAuthenticated } from './api-url';

/**
 * Listen for postMessage auto-auth from the parent Phoenix frame.
 *
 * The parent sends: { action: 'auto_auth', password: '<internal_password>' }
 * We call POST /api/auth/login with the password, store the token,
 * and resolve the returned promise so the caller can navigate.
 */

type AuthResolve = () => void;
let pendingResolve: AuthResolve | null = null;

export function waitForAutoAuth(): Promise<boolean> {
  // Only works inside an iframe
  if (window === window.parent) return Promise.resolve(false);
  // Already authenticated
  if (isAuthenticated()) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    // Timeout after 3 seconds — fall back to manual login
    const timeout = setTimeout(() => {
      pendingResolve = null;
      resolve(false);
    }, 3000);

    pendingResolve = () => {
      clearTimeout(timeout);
      resolve(true);
    };
  });
}

async function handleAutoAuth(password: string): Promise<boolean> {
  const base = getApiUrl();
  const url = base ? `${base}/api/auth/login` : '/api/auth/login';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json()) as { success?: boolean; token?: string };
    if (res.ok && data.success) {
      setToken(data.token ?? '');
      return true;
    }
  } catch {
    // Auth failed — let user fall back to manual login
  }
  return false;
}

function onMessage(event: MessageEvent): void {
  // Basic validation: must have the expected action
  const data = event.data as { action?: string; password?: string } | undefined;
  if (!data || data.action !== 'auto_auth' || !data.password) return;

  // Remove listener after first valid message
  window.removeEventListener('message', onMessage);

  void handleAutoAuth(data.password).then((success) => {
    if (success && pendingResolve) {
      pendingResolve();
      pendingResolve = null;
    }
  });
}

// Start listening immediately when this module is imported
if (window !== window.parent) {
  window.addEventListener('message', onMessage);
}
