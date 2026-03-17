import { describe, it, expect } from 'vitest';
import {
  CHAT_STATES,
  CHAT_INPUT_PLACEHOLDER,
  getChatInputPlaceholder,
  isRetryableError,
  STATE_LABELS,
  RESPONSE_TIMEOUT_MS,
  RECONNECT_INTERVAL_MS,
  WS_CLOSE,
  type ChatState,
} from './chat-state';

describe('chat-state', () => {
  it('defines all expected chat states', () => {
    expect(CHAT_STATES.INITIALIZING).toBe('INITIALIZING');
    expect(CHAT_STATES.AGENT_OFFLINE).toBe('AGENT_OFFLINE');
    expect(CHAT_STATES.UNAUTHENTICATED).toBe('UNAUTHENTICATED');
    expect(CHAT_STATES.AUTH_PENDING).toBe('AUTH_PENDING');
    expect(CHAT_STATES.AUTHENTICATED).toBe('AUTHENTICATED');
    expect(CHAT_STATES.AWAITING_RESPONSE).toBe('AWAITING_RESPONSE');
    expect(CHAT_STATES.LOGGING_OUT).toBe('LOGGING_OUT');
    expect(CHAT_STATES.ERROR).toBe('ERROR');
  });

  it('STATE_LABELS has a string label for every ChatState', () => {
    const states = Object.values(CHAT_STATES) as ChatState[];
    for (const s of states) {
      expect(STATE_LABELS[s]).toBeDefined();
      expect(typeof STATE_LABELS[s]).toBe('string');
      expect(STATE_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it('exports positive timeout and reconnect interval', () => {
    expect(RESPONSE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RECONNECT_INTERVAL_MS).toBeGreaterThan(0);
  });

  it('WS_CLOSE has expected close codes', () => {
    expect(WS_CLOSE.ANOTHER_SESSION_ACTIVE).toBe(4000);
    expect(WS_CLOSE.UNAUTHORIZED).toBe(4001);
    expect(WS_CLOSE.SESSION_TAKEN_OVER).toBe(4002);
  });

  it('getChatInputPlaceholder returns WORKING for AWAITING_RESPONSE', () => {
    expect(getChatInputPlaceholder(CHAT_STATES.AWAITING_RESPONSE)).toBe(CHAT_INPUT_PLACEHOLDER.WORKING);
  });

  it('getChatInputPlaceholder returns READY for AUTHENTICATED', () => {
    expect(getChatInputPlaceholder(CHAT_STATES.AUTHENTICATED)).toBe(CHAT_INPUT_PLACEHOLDER.READY);
  });

  it('getChatInputPlaceholder returns AUTH_REQUIRED for unauthenticated states', () => {
    expect(getChatInputPlaceholder(CHAT_STATES.INITIALIZING)).toBe(CHAT_INPUT_PLACEHOLDER.AUTH_REQUIRED);
    expect(getChatInputPlaceholder(CHAT_STATES.UNAUTHENTICATED)).toBe(CHAT_INPUT_PLACEHOLDER.AUTH_REQUIRED);
    expect(getChatInputPlaceholder(CHAT_STATES.AGENT_OFFLINE)).toBe(CHAT_INPUT_PLACEHOLDER.AUTH_REQUIRED);
    expect(getChatInputPlaceholder(CHAT_STATES.ERROR)).toBe(CHAT_INPUT_PLACEHOLDER.AUTH_REQUIRED);
  });

  it('isRetryableError returns false for null', () => {
    expect(isRetryableError(null)).toBe(false);
  });

  it('isRetryableError returns false for Another session is already active', () => {
    expect(isRetryableError('Another session is already active')).toBe(false);
  });

  it('isRetryableError returns false for Your session was taken over by another client', () => {
    expect(isRetryableError('Your session was taken over by another client')).toBe(false);
  });

  it('isRetryableError returns true for other error messages', () => {
    expect(isRetryableError('Response timed out. The AI took too long to respond.')).toBe(true);
    expect(isRetryableError('An unexpected error occurred')).toBe(true);
  });
});
