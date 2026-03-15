export function getApiUrl(): string {
  const env = typeof __API_URL__ !== 'undefined' ? __API_URL__ : '';
  if (env) return env.replace(/\/$/, '');
  return '';
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
