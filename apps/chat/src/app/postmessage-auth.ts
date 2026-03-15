import { loginWithPassword, isAuthenticated } from './api-url';

const AUTO_AUTH_TIMEOUT_MS = 3000;

type AuthResolve = () => void;
let pendingResolve: AuthResolve | null = null;

export function waitForAutoAuth(): Promise<boolean> {
  if (window === window.parent) return Promise.resolve(false);
  if (isAuthenticated()) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      pendingResolve = null;
      resolve(false);
    }, AUTO_AUTH_TIMEOUT_MS);

    pendingResolve = () => {
      clearTimeout(timeout);
      resolve(true);
    };
  });
}

async function handleAutoAuth(password: string): Promise<boolean> {
  const result = await loginWithPassword(password);
  return result.success;
}

function onMessage(event: MessageEvent): void {
  const data = event.data as { action?: string; password?: string } | undefined;
  const password = data?.password;
  if (!data || data.action !== 'auto_auth' || typeof password !== 'string') return;

  window.removeEventListener('message', onMessage);

  void (async () => {
    const success = await handleAutoAuth(password);
    if (success && pendingResolve) {
      pendingResolve();
      pendingResolve = null;
    }
  })();
}

if (window !== window.parent) {
  window.addEventListener('message', onMessage);
}
