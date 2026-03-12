import { describe, it, expect, vi, afterEach } from 'vitest';
import { isChatModelLocked } from './api-url';

describe('isChatModelLocked', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when VITE_LOCK_CHAT_MODEL is unset', () => {
    expect(isChatModelLocked()).toBe(false);
  });

  it('returns true when VITE_LOCK_CHAT_MODEL is "true"', () => {
    vi.stubEnv('VITE_LOCK_CHAT_MODEL', 'true');
    expect(isChatModelLocked()).toBe(true);
  });

  it('returns true when VITE_LOCK_CHAT_MODEL is "1"', () => {
    vi.stubEnv('VITE_LOCK_CHAT_MODEL', '1');
    expect(isChatModelLocked()).toBe(true);
  });

  it('returns false when VITE_LOCK_CHAT_MODEL is "false"', () => {
    vi.stubEnv('VITE_LOCK_CHAT_MODEL', 'false');
    expect(isChatModelLocked()).toBe(false);
  });

  it('returns false when VITE_LOCK_CHAT_MODEL is "0"', () => {
    vi.stubEnv('VITE_LOCK_CHAT_MODEL', '0');
    expect(isChatModelLocked()).toBe(false);
  });

  it('returns true when VITE_LOCK_CHAT_MODEL is any other non-empty string', () => {
    vi.stubEnv('VITE_LOCK_CHAT_MODEL', 'yes');
    expect(isChatModelLocked()).toBe(true);
  });
});
