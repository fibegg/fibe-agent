import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useChatWebSocket } from './use-chat-websocket';
import { CHAT_STATES } from './chat-state';

vi.mock('../api-url', () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthTokenForRequest: vi.fn(() => ''),
  getWsUrl: vi.fn(() => 'ws://test'),
  clearToken: vi.fn(),
}));

describe('useChatWebSocket', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'WebSocket',
      class MockWebSocket {
        close = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns state, send, reconnect, and other expected fields', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    expect(result.current.state).toBeDefined();
    expect(typeof result.current.send).toBe('function');
    expect(typeof result.current.reconnect).toBe('function');
    expect(typeof result.current.startAuth).toBe('function');
    expect(typeof result.current.dismissError).toBe('function');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.authModal).toEqual({
      authUrl: null,
      deviceCode: null,
      isManualToken: false,
    });
  });

  it('reconnect can be called without throwing', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    expect(() => {
      act(() => {
        result.current.reconnect();
      });
    }).not.toThrow();
  });

  it('initial state is INITIALIZING', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    expect(result.current.state).toBe(CHAT_STATES.INITIALIZING);
  });
});
