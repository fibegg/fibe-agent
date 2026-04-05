import { loginWithPassword, isAuthenticated } from './api-url';

const AUTO_AUTH_TIMEOUT_MS = 3000;

type AuthResolve = () => void;
let pendingResolve: AuthResolve | null = null;

/**
 * Tracks whether auto-auth already completed successfully before
 * waitForAutoAuth() was called. This handles the race where the parent
 * iframe sends auto_auth before the LoginPage mounts its useEffect.
 */
let earlyAuthSuccess = false;

/**
 * Guard to prevent concurrent login attempts from duplicate postMessages
 * sent by the parent's _sendAuth() retry loop.
 */
let authInFlight = false;

export function waitForAutoAuth(): Promise<boolean> {
  if (window === window.parent) return Promise.resolve(false);
  // The auto_auth message arrived (and succeeded) before this was called.
  // Resolve immediately so LoginPage navigates to chat.
  if (earlyAuthSuccess) {
    earlyAuthSuccess = false;
    return Promise.resolve(true);
  }

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

  // Already authenticated (e.g. from a previous message in the retry loop)
  if (isAuthenticated()) return;

  // Prevent concurrent login attempts from the parent's retry loop
  if (authInFlight) return;
  authInFlight = true;

  void (async () => {
    try {
      const success = await handleAutoAuth(password);
      if (success) {
        if (pendingResolve) {
          // LoginPage is already waiting — resolve its promise
          pendingResolve();
          pendingResolve = null;
        } else {
          // LoginPage hasn't mounted yet — store for when it calls waitForAutoAuth()
          earlyAuthSuccess = true;
        }
      }
    } finally {
      authInFlight = false;
    }
  })();
}

const LISTENER_KEY = '__auto_auth_listener';
if (window !== window.parent) {
  const existing = window[LISTENER_KEY];
  if (existing) {
    window.removeEventListener('message', existing);
  }
  window.addEventListener('message', onMessage);
  window[LISTENER_KEY] = onMessage;
}
