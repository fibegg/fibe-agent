import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveConversationId, useConversations, type ConversationMeta } from './use-conversations';

const mockApiRequest = vi.fn();

vi.mock('../api-url', () => ({
  apiRequest: (path: string, opts?: RequestInit) => mockApiRequest(path, opts),
}));

const DEFAULT_CONV: ConversationMeta = {
  id: 'default',
  title: 'Default',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
};

const THREAD_CONV: ConversationMeta = {
  id: 'thread-1',
  title: 'Thread one',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: '2026-01-01T00:00:01.000Z',
};

function okJson(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

describe('useConversations', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('prefers the URL conversation over localStorage on page load', () => {
    localStorage.setItem('fibe:activeConversationId', 'default');
    window.history.replaceState(null, '', '/?c=thread-1');

    expect(getActiveConversationId()).toBe('thread-1');
  });

  it('validates the URL-selected conversation without falling back to stored default', async () => {
    localStorage.setItem('fibe:activeConversationId', 'default');
    window.history.replaceState(null, '', '/?c=thread-1');
    mockApiRequest.mockResolvedValue(okJson([DEFAULT_CONV, THREAD_CONV]));

    const { result } = renderHook(() => useConversations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeId).toBe('thread-1');
    expect(localStorage.getItem('fibe:activeConversationId')).toBe('thread-1');
    expect(window.location.search).toBe('?c=thread-1');
  });

  it('falls back to default when the active conversation no longer exists', async () => {
    localStorage.setItem('fibe:activeConversationId', 'thread-missing');
    window.history.replaceState(null, '', '/?c=thread-missing');
    mockApiRequest.mockResolvedValue(okJson([DEFAULT_CONV]));

    const { result } = renderHook(() => useConversations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeId).toBe('default');
    expect(localStorage.getItem('fibe:activeConversationId')).toBe('default');
    expect(window.location.search).toBe('');
  });

  it('switches conversations through the same state, storage, and URL path', async () => {
    mockApiRequest.mockResolvedValue(okJson([DEFAULT_CONV, THREAD_CONV]));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.switchTo('thread-1');
    });

    expect(result.current.activeId).toBe('thread-1');
    expect(localStorage.getItem('fibe:activeConversationId')).toBe('thread-1');
    expect(window.location.search).toBe('?c=thread-1');
  });
});
