import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatAuthUI } from './use-chat-auth-ui';
import { CHAT_STATES } from './chat-state';

describe('useChatAuthUI', () => {
  const baseAuthModal = { authUrl: null, deviceCode: null, isManualToken: false };

  it('returns text-muted-foreground when state is AUTHENTICATED', () => {
    const { result } = renderHook(() => useChatAuthUI(CHAT_STATES.AUTHENTICATED, baseAuthModal));
    expect(result.current.statusClass).toBe('text-muted-foreground');
  });

  it('returns text-destructive when state is ERROR', () => {
    const { result } = renderHook(() => useChatAuthUI(CHAT_STATES.ERROR, baseAuthModal));
    expect(result.current.statusClass).toBe('text-destructive');
  });

  it('returns text-warning for other states', () => {
    const { result } = renderHook(() => useChatAuthUI(CHAT_STATES.INITIALIZING, baseAuthModal));
    expect(result.current.statusClass).toBe('text-warning');
  });

  it('showModelSelector is true when AUTHENTICATED', () => {
    const { result } = renderHook(() => useChatAuthUI(CHAT_STATES.AUTHENTICATED, baseAuthModal));
    expect(result.current.showModelSelector).toBe(true);
  });

  it('showModelSelector is true when AWAITING_RESPONSE', () => {
    const { result } = renderHook(() => useChatAuthUI(CHAT_STATES.AWAITING_RESPONSE, baseAuthModal));
    expect(result.current.showModelSelector).toBe(true);
  });

  it('showModelSelector is false when UNAUTHENTICATED', () => {
    const { result } = renderHook(() => useChatAuthUI(CHAT_STATES.UNAUTHENTICATED, baseAuthModal));
    expect(result.current.showModelSelector).toBe(false);
  });

  it('showAuthModal is true when AUTH_PENDING', () => {
    const { result } = renderHook(() => useChatAuthUI(CHAT_STATES.AUTH_PENDING, baseAuthModal));
    expect(result.current.showAuthModal).toBe(true);
  });

  it('showAuthModal is false when UNAUTHENTICATED', () => {
    const { result } = renderHook(() => useChatAuthUI(CHAT_STATES.UNAUTHENTICATED, baseAuthModal));
    expect(result.current.showAuthModal).toBe(false);
  });

  it('showAuthModal is false when AUTHENTICATED', () => {
    const { result } = renderHook(() => useChatAuthUI(CHAT_STATES.AUTHENTICATED, baseAuthModal));
    expect(result.current.showAuthModal).toBe(false);
  });

  it('authModalForModal returns authModal unchanged', () => {
    const authModal = { authUrl: 'u', deviceCode: 'c', isManualToken: false };
    const { result } = renderHook(() => useChatAuthUI(CHAT_STATES.AUTHENTICATED, authModal));
    expect(result.current.authModalForModal).toBe(authModal);
  });
});
