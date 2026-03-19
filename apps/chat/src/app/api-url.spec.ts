import { describe, it, expect, vi, afterEach } from 'vitest';
import { getApiUrl, getWsUrl, isChatModelLocked } from './api-url';

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

describe('getWsUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
    const url = getWsUrl();
    expect(url).toMatch(/^wss?:\/\//);
    expect(url).toContain(window.location.host);
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
