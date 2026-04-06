import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  getApiUrl,
  getWsUrl,
  isChatModelLocked,
  buildApiUrl,
  getToken,
  setToken,
  clearToken,
  isAuthenticated,
  getAuthTokenForRequest,
  loginWithPassword,
  NO_PASSWORD_SENTINEL,
  TOKEN_STORAGE_KEY,
} from './api-url';

describe('getApiUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty string when API_URL is unset', () => {
    vi.stubGlobal('__API_URL__', '');
    expect(getApiUrl()).toBe('');
  });

  it('returns trimmed URL without trailing slash', () => {
    vi.stubGlobal('__API_URL__', 'https://api.example.com/');
    expect(getApiUrl()).toBe('https://api.example.com');
  });

  it('returns URL as-is when no trailing slash', () => {
    vi.stubGlobal('__API_URL__', 'https://api.example.com');
    expect(getApiUrl()).toBe('https://api.example.com');
  });
});

describe('buildApiUrl', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalWindow: any;

  beforeEach(() => {
    originalWindow = global.window;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.window = originalWindow;
  });

  it('builds URL with base when API_URL is set', () => {
    vi.stubGlobal('__API_URL__', 'https://api.example.com');
    expect(buildApiUrl('/health')).toBe('https://api.example.com/health');
  });

  it('adds leading slash to path when missing', () => {
    vi.stubGlobal('__API_URL__', 'https://api.example.com');
    expect(buildApiUrl('health')).toBe('https://api.example.com/health');
  });

  it('returns relative path when no API base', () => {
    vi.stubGlobal('__API_URL__', '');
    expect(buildApiUrl('/health')).toBe('/health');
  });

  it('adds leading slash to relative path when missing and no base', () => {
    vi.stubGlobal('__API_URL__', '');
    expect(buildApiUrl('health')).toBe('/health');
  });

  it('prepends __BASENAME__ when available and API_URL is empty', () => {
    vi.stubGlobal('__API_URL__', '');
    global.window = Object.assign({}, originalWindow, { __BASENAME__: '/tab1' });
    expect(buildApiUrl('/health')).toBe('/tab1/health');
  });
});

describe('getWsUrl', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalWindow: any;

  beforeEach(() => {
    originalWindow = global.window;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.window = originalWindow;
  });

  it('uses wss when API base is https', () => {
    vi.stubGlobal('__API_URL__', 'https://api.example.com');
    expect(getWsUrl()).toBe('wss://api.example.com');
  });

  it('uses ws when API base is http', () => {
    vi.stubGlobal('__API_URL__', 'http://localhost:3000');
    expect(getWsUrl()).toBe('ws://localhost:3000');
  });

  it('uses current host when API_URL is empty', () => {
    vi.stubGlobal('__API_URL__', '');
    global.window = Object.assign({}, originalWindow, {
      location: { protocol: 'https:', host: 'localhost:4200' },
      __BASENAME__: undefined,
    });
    const url = getWsUrl();
    expect(url).toBe('wss://localhost:4200');
  });

  it('appends __BASENAME__ when returning local ws URL', () => {
    vi.stubGlobal('__API_URL__', '');
    global.window = Object.assign({}, originalWindow, {
      location: { protocol: 'http:', host: 'localhost:4200' },
      __BASENAME__: '/tab1',
    });
    const url = getWsUrl();
    expect(url).toBe('ws://localhost:4200/tab1');
  });
});

describe('isChatModelLocked', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when LOCK_CHAT_MODEL is unset', () => {
    vi.stubGlobal('__LOCK_CHAT_MODEL__', '');
    expect(isChatModelLocked()).toBe(false);
  });

  it('returns true when LOCK_CHAT_MODEL is "true"', () => {
    vi.stubGlobal('__LOCK_CHAT_MODEL__', 'true');
    expect(isChatModelLocked()).toBe(true);
  });

  it('returns true when LOCK_CHAT_MODEL is "1"', () => {
    vi.stubGlobal('__LOCK_CHAT_MODEL__', '1');
    expect(isChatModelLocked()).toBe(true);
  });

  it('returns false when LOCK_CHAT_MODEL is "false"', () => {
    vi.stubGlobal('__LOCK_CHAT_MODEL__', 'false');
    expect(isChatModelLocked()).toBe(false);
  });

  it('returns false when LOCK_CHAT_MODEL is "0"', () => {
    vi.stubGlobal('__LOCK_CHAT_MODEL__', '0');
    expect(isChatModelLocked()).toBe(false);
  });

  it('returns true when LOCK_CHAT_MODEL is any other non-empty string', () => {
    vi.stubGlobal('__LOCK_CHAT_MODEL__', 'yes');
    expect(isChatModelLocked()).toBe(true);
  });
});

describe('token management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getToken returns empty string when no token stored', () => {
    expect(getToken()).toBe('');
  });

  it('setToken stores token in localStorage', () => {
    setToken('mytoken');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('mytoken');
  });

  it('setToken stores NO_PASSWORD_SENTINEL when value is empty string', () => {
    setToken('');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(NO_PASSWORD_SENTINEL);
  });

  it('clearToken removes the key', () => {
    setToken('tok');
    clearToken();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('isAuthenticated returns false when no token', () => {
    expect(isAuthenticated()).toBe(false);
  });

  it('isAuthenticated returns true when token is stored', () => {
    setToken('tok');
    expect(isAuthenticated()).toBe(true);
  });

  it('getAuthTokenForRequest returns empty string for NO_PASSWORD_SENTINEL', () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, NO_PASSWORD_SENTINEL);
    expect(getAuthTokenForRequest()).toBe('');
  });

  it('getAuthTokenForRequest returns token when real token stored', () => {
    setToken('realtoken');
    expect(getAuthTokenForRequest()).toBe('realtoken');
  });
});

describe('loginWithPassword', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('__API_URL__', '');
    vi.stubGlobal('__LOCK_CHAT_MODEL__', '');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns success: true and stores token on successful login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, token: 'newtoken' }),
    }));

    const result = await loginWithPassword('password');
    expect(result.success).toBe(true);
    expect(getToken()).toBe('newtoken');
  });

  it('returns success: false when server returns ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Bad credentials' }),
    }));

    const result = await loginWithPassword('wrong');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad credentials');
  });

  it('returns success: false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const result = await loginWithPassword('password');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection error');
  });
});

