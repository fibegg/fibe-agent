import { API_PATHS } from '@shared/api-paths';

export function getApiUrl(): string {
  const env = typeof __API_URL__ !== 'undefined' ? __API_URL__ : '';
  if (env) return env.replace(/\/$/, '');
  return '';
}

export function buildApiUrl(path: string): string {
  const base = getApiUrl();
  if (base) return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  return path.startsWith('/') ? path : `/${path}`;
}

export function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const url = buildApiUrl(path);
  const token = getAuthTokenForRequest();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

export function isChatModelLocked(): boolean {
  const v = typeof __LOCK_CHAT_MODEL__ !== 'undefined' ? __LOCK_CHAT_MODEL__ : '';
  return (
    typeof v === 'string' &&
    v.length > 0 &&
    v !== 'false' &&
    v !== '0'
  );
}

export function getWsUrl(): string {
  const base = getApiUrl();
  if (base) {
    const wsProtocol = base.startsWith('https') ? 'wss' : 'ws';
    const host = base.replace(/^https?:\/\//, '');
    return `${wsProtocol}://${host}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export const TOKEN_STORAGE_KEY = 'agent_password';

export const NO_PASSWORD_SENTINEL = '__no_password__';

export function getToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

export function setToken(value: string): void {
  if (value) {
    localStorage.setItem(TOKEN_STORAGE_KEY, value);
  } else {
    localStorage.setItem(TOKEN_STORAGE_KEY, NO_PASSWORD_SENTINEL);
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== '';
}

export function getAuthTokenForRequest(): string {
  const t = getToken();
  return t === NO_PASSWORD_SENTINEL ? '' : t;
}

export async function loginWithPassword(
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiRequest(API_PATHS.AUTH_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json()) as {
      success?: boolean;
      token?: string;
      error?: string;
    };
    if (res.ok && data.success) {
      setToken(data.token ?? '');
      return { success: true };
    }
    return { success: false, error: data.error };
  } catch {
    return { success: false, error: 'Connection error. Please try again.' };
  }
}
