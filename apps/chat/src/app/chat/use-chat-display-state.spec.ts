import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatDisplayState } from './use-chat-display-state';
import { CHAT_STATES } from './chat-state';
import type { ChatMessage } from './message-list';
import type { ThinkingActivity } from './thinking-types';

vi.mock('./use-mobile-brain-classes', () => ({
  useMobileBrainClasses: () => ({ brain: 'brain-c', accent: 'accent-c' }),
}));

const baseParams = {
  messages: [] as ChatMessage[],
  searchQuery: '',
  state: CHAT_STATES.AUTHENTICATED,
  activityLog: [] as ThinkingActivity[],
  sessionActivity: [],
  lastSentMessage: null as string | null,
};

describe('useChatDisplayState', () => {
  it('returns filteredMessages equal to messages when searchQuery is empty', () => {
    const messages = [
      { role: 'user', body: 'hi', created_at: '2020-01-01' },
      { role: 'assistant', body: 'hello', created_at: '2020-01-02' },
    ];
    const { result } = renderHook(() =>
      useChatDisplayState({ ...baseParams, messages })
    );
    expect(result.current.filteredMessages).toHaveLength(2);
    expect(result.current.filteredMessages).toEqual(messages);
  });

  it('filters messages by searchQuery', () => {
    const messages = [
      { role: 'user', body: 'hello world', created_at: '2020-01-01' },
      { role: 'assistant', body: 'foo bar', created_at: '2020-01-02' },
    ];
    const { result } = renderHook(() =>
      useChatDisplayState({ ...baseParams, messages, searchQuery: 'hello' })
    );
    expect(result.current.filteredMessages).toHaveLength(1);
    expect(result.current.filteredMessages[0].body).toBe('hello world');
  });

  it('returns lastUserMessage from lastSentMessage when set', () => {
    const { result } = renderHook(() =>
      useChatDisplayState({ ...baseParams, lastSentMessage: 'sent' })
    );
    expect(result.current.lastUserMessage).toBe('sent');
  });

  it('returns lastUserMessage from messages when lastSentMessage is null', () => {
    const messages = [
      { role: 'user', body: 'from history', created_at: '2020-01-01' },
    ];
    const { result } = renderHook(() =>
      useChatDisplayState({ ...baseParams, messages })
    );
    expect(result.current.lastUserMessage).toBe('from history');
  });

  it('returns displayStory from activityLog when AWAITING_RESPONSE', () => {
    const activityLog: ThinkingActivity[] = [
      { id: '1', type: 'step', message: 'Step', timestamp: new Date(), details: '' },
    ];
    const { result } = renderHook(() =>
      useChatDisplayState({
        ...baseParams,
        state: CHAT_STATES.AWAITING_RESPONSE,
        activityLog,
      })
    );
    expect(result.current.displayStory).toHaveLength(1);
    expect(result.current.displayStory[0].message).toBe('Step');
  });

  it('returns sessionTimeMs and mobileSessionStats', () => {
    const { result } = renderHook(() => useChatDisplayState(baseParams));
    expect(typeof result.current.sessionTimeMs).toBe('number');
    expect(result.current.mobileSessionStats).toEqual(
      expect.objectContaining({ totalActions: expect.any(Number), completed: expect.any(Number), processing: expect.any(Number) })
    );
  });

  it('returns mobileBrainClasses from mocked hook', () => {
    const { result } = renderHook(() => useChatDisplayState(baseParams));
    expect(result.current.mobileBrainClasses).toEqual({ brain: 'brain-c', accent: 'accent-c' });
  });

  it('returns sessionTokenUsage null when no assistant messages have usage', () => {
    const messages = [
      { role: 'user', body: 'hi', created_at: '' },
      { role: 'assistant', body: 'hey', created_at: '' },
    ];
    const { result } = renderHook(() => useChatDisplayState({ ...baseParams, messages }));
    expect(result.current.sessionTokenUsage).toBeNull();
  });

  it('returns sessionTokenUsage sum when assistant messages have usage', () => {
    const messages = [
      { role: 'assistant', body: 'a', created_at: '', usage: { inputTokens: 10, outputTokens: 20 } },
      { role: 'assistant', body: 'b', created_at: '', usage: { inputTokens: 5, outputTokens: 15 } },
    ];
    const { result } = renderHook(() => useChatDisplayState({ ...baseParams, messages }));
    expect(result.current.sessionTokenUsage).toEqual({ inputTokens: 15, outputTokens: 35 });
  });
});
