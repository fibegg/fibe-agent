import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useChatWebSocket } from './use-chat-websocket';
import { CHAT_STATES, WS_CLOSE } from './chat-state';

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

  it('returns state, send, reconnect, interruptAgent, and other expected fields', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    expect(result.current.state).toBeDefined();
    expect(typeof result.current.send).toBe('function');
    expect(typeof result.current.reconnect).toBe('function');
    expect(typeof result.current.interruptAgent).toBe('function');
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

describe('useChatWebSocket thinking callbacks', () => {
  let messageHandler: ((e: MessageEvent) => void) | null = null;

  beforeEach(() => {
    messageHandler = null;
    vi.stubGlobal(
      'WebSocket',
      class MockWebSocket {
        readyState = 1;
        send = vi.fn();
        close = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
        set onmessage(handler: (e: MessageEvent) => void) {
          messageHandler = handler;
        }
        get onmessage(): (e: MessageEvent) => void {
          return messageHandler ?? (() => undefined);
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invokes onReasoningChunk when reasoning_chunk is received', async () => {
    const onReasoningChunk = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    renderHook(
      () =>
        useChatWebSocket(undefined, undefined, undefined, undefined, {
          onReasoningChunk,
        }),
      { wrapper }
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(messageHandler).not.toBeNull();
    act(() => {
      messageHandler?.({
        data: JSON.stringify({ type: 'reasoning_chunk', text: 'hello' }),
      } as MessageEvent);
    });
    expect(onReasoningChunk).toHaveBeenCalledWith('hello');
  });

  it('invokes onThinkingStep when thinking_step is received', async () => {
    const onThinkingStep = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    renderHook(
      () =>
        useChatWebSocket(undefined, undefined, undefined, undefined, {
          onThinkingStep,
        }),
      { wrapper }
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(messageHandler).not.toBeNull();
    act(() => {
      messageHandler?.({
        data: JSON.stringify({
          type: 'thinking_step',
          id: '1',
          title: 'Generating',
          status: 'processing',
          timestamp: new Date().toISOString(),
        }),
      } as MessageEvent);
    });
    expect(onThinkingStep).toHaveBeenCalledTimes(1);
    expect(onThinkingStep.mock.calls[0][0].id).toBe('1');
    expect(onThinkingStep.mock.calls[0][0].title).toBe('Generating');
    expect(onThinkingStep.mock.calls[0][0].status).toBe('processing');
  });
});

describe('useChatWebSocket close codes', () => {
  let lastWs: { onclose?: (e: CloseEvent) => void; onopen?: () => void } | null = null;

  beforeEach(() => {
    lastWs = null;
    vi.stubGlobal(
      'WebSocket',
      class MockWebSocket {
        readyState = 0;
        close = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
        send = vi.fn();
        set onclose(handler: (e: CloseEvent) => void) {
          (this as unknown as { _onclose: (e: CloseEvent) => void })._onclose = handler;
        }
        get onclose() {
          return (this as unknown as { _onclose: (e: CloseEvent) => void })._onclose;
        }
        set onopen(handler: () => void) {
          (this as unknown as { _onopen: () => void })._onopen = handler;
        }
        get onopen() {
          return (this as unknown as { _onopen: () => void })._onopen;
        }
        constructor() {
          lastWs = this as unknown as typeof lastWs;
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets ERROR and message when closed with 4000', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const ws = lastWs as unknown as { _onclose: (e: CloseEvent) => void };
    act(() => {
      ws._onclose({ code: WS_CLOSE.ANOTHER_SESSION_ACTIVE } as CloseEvent);
    });
    expect(result.current.state).toBe(CHAT_STATES.ERROR);
    expect(result.current.errorMessage).toBe('Another session is already active');
  });

  it('sets ERROR and message when closed with 4002', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const ws = lastWs as unknown as { _onclose: (e: CloseEvent) => void };
    act(() => {
      ws._onclose({ code: WS_CLOSE.SESSION_TAKEN_OVER } as CloseEvent);
    });
    expect(result.current.state).toBe(CHAT_STATES.ERROR);
    expect(result.current.errorMessage).toBe('Your session was taken over by another client');
  });

  it('clears token when closed with 4001', async () => {
    const { clearToken } = await import('../api-url');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const ws = lastWs as unknown as { _onclose: (e: CloseEvent) => void };
    act(() => {
      ws._onclose({ code: WS_CLOSE.UNAUTHORIZED } as CloseEvent);
    });
    expect(clearToken).toHaveBeenCalled();
  });
});
