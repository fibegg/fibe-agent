import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useChatInitialData } from './use-chat-initial-data';

const mockApiRequest = vi.fn();
vi.mock('../api-url', () => ({
  apiRequest: (path: string) => mockApiRequest(path),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useChatInitialData', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
  });

  it('returns messages and modelOptions and loadMessages', () => {
    mockApiRequest.mockImplementation(() => new Promise(() => undefined));
    const { result } = renderHook(() => useChatInitialData(false), { wrapper });
    expect(result.current.messages).toEqual([]);
    expect(result.current.modelOptions).toEqual([]);
    expect(typeof result.current.loadMessages).toBe('function');
  });

  it('when authenticated fetches messages and model options', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ['gpt-4', 'claude'] });
    const { result } = renderHook(() => useChatInitialData(true), { wrapper });
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(result.current.messages).toEqual([]);
      expect(result.current.modelOptions).toEqual(['gpt-4', 'claude']);
    });
  });

  it('when not authenticated does not fetch', () => {
    const { result } = renderHook(() => useChatInitialData(false), { wrapper });
    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it('setMessages updates messages', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    const { result } = renderHook(() => useChatInitialData(true), { wrapper });
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalled();
    });
    result.current.setMessages([{ role: 'user', body: 'hi', created_at: '2020-01-01' }]);
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].body).toBe('hi');
    });
  });
});
