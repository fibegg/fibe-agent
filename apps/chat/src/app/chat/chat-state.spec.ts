import { describe, it, expect } from 'vitest';
import {
  CHAT_STATES,
  STATE_LABELS,
  RESPONSE_TIMEOUT_MS,
  RECONNECT_INTERVAL_MS,
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
});
