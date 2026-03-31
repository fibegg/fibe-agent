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

describe('useChatWebSocket actions (startAuth, cancelAuth, submitAuthCode, dismissError, logout, reauthenticate)', () => {
  let lastWs: {
    send: ReturnType<typeof vi.fn>;
    readyState: number;
    onmessage?: ((e: MessageEvent) => void) | null;
    onclose?: ((e: CloseEvent) => void) | null;
  } | null = null;

  beforeEach(() => {
    lastWs = null;
    vi.stubGlobal(
      'WebSocket',
      class MockWebSocket {
        readyState = WebSocket.OPEN;
        send = vi.fn();
        close = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
        onmessage: ((e: MessageEvent) => void) | null = null;
        onclose: ((e: CloseEvent) => void) | null = null;
        constructor() {
          lastWs = this as typeof lastWs;
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );

  it('startAuth sends initiate_auth and sets AUTH_PENDING state', async () => {
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => { result.current.startAuth(); });

    expect(lastWs?.send).toHaveBeenCalledWith(JSON.stringify({ action: 'initiate_auth' }));
    expect(result.current.state).toBe(CHAT_STATES.AUTH_PENDING);
  });

  it('cancelAuth clears authModal and sends cancel_auth', async () => {
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => { result.current.cancelAuth(); });

    expect(lastWs?.send).toHaveBeenCalledWith(JSON.stringify({ action: 'cancel_auth' }));
    expect(result.current.authModal).toEqual({ authUrl: null, deviceCode: null, isManualToken: false });
    expect(result.current.state).toBe(CHAT_STATES.UNAUTHENTICATED);
  });

  it('submitAuthCode sends submit_auth_code with trimmed code', async () => {
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => { result.current.submitAuthCode('  mycode  '); });

    expect(lastWs?.send).toHaveBeenCalledWith(JSON.stringify({ action: 'submit_auth_code', code: 'mycode' }));
  });

  it('dismissError clears errorMessage and sets AUTHENTICATED state', async () => {
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => { result.current.setErrorMessage('Some error'); });
    act(() => { result.current.dismissError(); });

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.state).toBe(CHAT_STATES.AUTHENTICATED);
  });

  it('interruptAgent sends interrupt_agent', async () => {
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => { result.current.interruptAgent(); });

    expect(lastWs?.send).toHaveBeenCalledWith(JSON.stringify({ action: 'interrupt_agent' }));
  });

  it('reauthenticate sends reauthenticate when user confirms', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => { result.current.reauthenticate(); });

    expect(lastWs?.send).toHaveBeenCalledWith(JSON.stringify({ action: 'reauthenticate' }));
    expect(result.current.state).toBe(CHAT_STATES.AUTH_PENDING);
  });

  it('reauthenticate does nothing when user cancels confirm', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const callCountBefore = (lastWs?.send as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => { result.current.reauthenticate(); });
    const callCountAfter = (lastWs?.send as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCountAfter).toBe(callCountBefore);
  });

  it('logout sends logout when user confirms', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => { result.current.logout(); });

    expect(lastWs?.send).toHaveBeenCalledWith(JSON.stringify({ action: 'logout' }));
    expect(result.current.state).toBe(CHAT_STATES.LOGGING_OUT);
  });

  it('logout does nothing when user cancels confirm', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const initState = result.current.state;
    act(() => { result.current.logout(); });
    expect(result.current.state).toBe(initState);
  });
});

describe('useChatWebSocket message handlers', () => {
  let messageHandler: ((e: MessageEvent) => void) | null = null;
  let wsSendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    messageHandler = null;
    wsSendMock = vi.fn();
    vi.stubGlobal(
      'WebSocket',
      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = 1;
        send = wsSendMock;
        close = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
        set onmessage(handler: (e: MessageEvent) => void) {
          messageHandler = handler;
        }
        get onmessage(): (e: MessageEvent) => void {
          return messageHandler ?? (() => undefined);
        }
        set onopen(handler: () => void) {
          handler(); // Auto-call open to trigger setup
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );

  it('handles auth_status authenticated (processing and not processing)', async () => {
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Not processing
    act(() => {
      messageHandler?.({ data: JSON.stringify({ type: 'auth_status', status: 'authenticated', isProcessing: false }) } as MessageEvent);
    });
    expect(result.current.state).toBe(CHAT_STATES.AUTHENTICATED);

    // Processing
    act(() => {
      messageHandler?.({ data: JSON.stringify({ type: 'auth_status', status: 'authenticated', isProcessing: true }) } as MessageEvent);
    });
    expect(result.current.state).toBe(CHAT_STATES.AWAITING_RESPONSE);
  });

  it('triggers response timeout if isProcessing but no response', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => process.nextTick(r)); });
    
    act(() => {
      messageHandler?.({ data: JSON.stringify({ type: 'auth_status', status: 'authenticated', isProcessing: true }) } as MessageEvent);
    });
    expect(result.current.state).toBe(CHAT_STATES.AWAITING_RESPONSE);
    
    act(() => {
      vi.runAllTimers();
    });
    
    expect(result.current.state).toBe(CHAT_STATES.ERROR);
    expect(result.current.errorMessage).toContain('timed out');
  });

  it('handles auth_status unauthenticated', async () => {
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    act(() => {
      messageHandler?.({ data: JSON.stringify({ type: 'auth_status', status: 'unauthenticated' }) } as MessageEvent);
    });
    expect(result.current.state).toBe(CHAT_STATES.UNAUTHENTICATED);
    expect(wsSendMock).toHaveBeenCalledWith(JSON.stringify({ action: 'initiate_auth' }));
  });

  it('handles auth_url_generated, auth_device_code, auth_manual_token, auth_success', async () => {
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'auth_url_generated', url: 'http://test' }) } as MessageEvent));
    expect(result.current.state).toBe(CHAT_STATES.AUTH_PENDING);
    expect(result.current.authModal.authUrl).toBe('http://test');

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'auth_device_code', code: '123' }) } as MessageEvent));
    expect(result.current.authModal.deviceCode).toBe('123');

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'auth_manual_token' }) } as MessageEvent));
    expect(result.current.authModal.isManualToken).toBe(true);

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'auth_success' }) } as MessageEvent));
    expect(result.current.state).toBe(CHAT_STATES.AUTHENTICATED);
    expect(result.current.authModal.isManualToken).toBe(false);
  });

  it('handles logout_success', async () => {
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    act(() => messageHandler?.({ data: JSON.stringify({ type: 'logout_success' }) } as MessageEvent));
    expect(result.current.state).toBe(CHAT_STATES.UNAUTHENTICATED);
  });

  it('handles error events', async () => {
    const { result } = renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    act(() => messageHandler?.({ data: JSON.stringify({ type: 'error', message: 'test error' }) } as MessageEvent));
    expect(result.current.state).toBe(CHAT_STATES.ERROR);
    expect(result.current.errorMessage).toBe('test error');
  });

  it('handles message events (assistant sets AUTHENTICATED)', async () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useChatWebSocket(onMessage), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    act(() => messageHandler?.({ data: JSON.stringify({ type: 'message', role: 'assistant', text: 'hi' }) } as MessageEvent));
    expect(result.current.state).toBe(CHAT_STATES.AUTHENTICATED);
    expect(onMessage).toHaveBeenCalled();
  });

  it('handles stream events', async () => {
    const onStreamStart = vi.fn();
    const onStreamChunk = vi.fn();
    const onStreamEnd = vi.fn();
    const thinkingCb = { onStreamStartData: vi.fn() };
    const { result } = renderHook(() => useChatWebSocket(undefined, onStreamChunk, onStreamStart, onStreamEnd, thinkingCb), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    
    act(() => messageHandler?.({ data: JSON.stringify({ type: 'stream_start', model: 'gpt' }) } as MessageEvent));
    expect(result.current.state).toBe(CHAT_STATES.AWAITING_RESPONSE);
    expect(onStreamStart).toHaveBeenCalledWith({ model: 'gpt' });
    expect(thinkingCb.onStreamStartData).toHaveBeenCalledWith({ model: 'gpt' });

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'stream_chunk', text: 'hi' }) } as MessageEvent));
    expect(onStreamChunk).toHaveBeenCalledWith('hi');

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'stream_end', usage: { inputTokens: 10, outputTokens: 20 }, model: 'gpt' }) } as MessageEvent));
    expect(result.current.state).toBe(CHAT_STATES.AUTHENTICATED);
    expect(onStreamEnd).toHaveBeenCalledWith({ inputTokens: 10, outputTokens: 20 }, 'gpt');
    
    // Also test stream_end missing variables properly handles fallback
    act(() => messageHandler?.({ data: JSON.stringify({ type: 'stream_end' }) } as MessageEvent));
    expect(onStreamEnd).toHaveBeenCalledWith(undefined, undefined);
  });

  it('handles tool_call, file_created, and other thinking callbacks', async () => {
    const thinkingCb = {
      onReasoningStart: vi.fn(),
      onReasoningEnd: vi.fn(),
      onToolOrFile: vi.fn(),
    };
    renderHook(() => useChatWebSocket(undefined, undefined, undefined, undefined, thinkingCb), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'reasoning_start' }) } as MessageEvent));
    expect(thinkingCb.onReasoningStart).toHaveBeenCalled();

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'reasoning_end' }) } as MessageEvent));
    expect(thinkingCb.onReasoningEnd).toHaveBeenCalled();

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'tool_call', name: 'myTool' }) } as MessageEvent));
    expect(thinkingCb.onToolOrFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tool_call', name: 'myTool' }));

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'file_created', name: 'myFile' }) } as MessageEvent));
    expect(thinkingCb.onToolOrFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'file_created', name: 'myFile' }));
  });

  it('handles activity events and queue_updated', async () => {
    const onPlaygroundChanged = vi.fn();
    const { result } = renderHook(() => useChatWebSocket(undefined, undefined, undefined, undefined, undefined, onPlaygroundChanged), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'activity_snapshot', activity: [{ id: '1' }] }) } as MessageEvent));
    expect(result.current.sessionActivity).toEqual([{ id: '1' }]);
    
    act(() => messageHandler?.({ data: JSON.stringify({ type: 'activity_snapshot', activity: {} }) } as MessageEvent));
    expect(result.current.sessionActivity).toEqual([]);

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'activity_appended', entry: { id: '2' } }) } as MessageEvent));
    expect(result.current.sessionActivity).toEqual([{ id: '2' }]);

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'activity_updated', entry: { id: '2', val: 'updated' } }) } as MessageEvent));
    expect(result.current.sessionActivity).toEqual([{ id: '2', val: 'updated' }]);
    
    // update non-existing, verifies the append fallback logic
    act(() => messageHandler?.({ data: JSON.stringify({ type: 'activity_updated', entry: { id: '3', val: 'new' } }) } as MessageEvent));
    expect(result.current.sessionActivity).toEqual([{ id: '2', val: 'updated' }, { id: '3', val: 'new' }]);

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'queue_updated', count: 5 }) } as MessageEvent));
    expect(result.current.queuedCount).toBe(5);
    
    act(() => messageHandler?.({ data: JSON.stringify({ type: 'queue_updated', count: null }) } as MessageEvent));
    expect(result.current.queuedCount).toBe(0);

    act(() => messageHandler?.({ data: JSON.stringify({ type: 'playground_changed' }) } as MessageEvent));
    expect(onPlaygroundChanged).toHaveBeenCalled();
  });
  
  it('handles model_updated', async () => {
    const onMessage = vi.fn();
    renderHook(() => useChatWebSocket(onMessage), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    act(() => messageHandler?.({ data: JSON.stringify({ type: 'model_updated', model: 'gpt-4' }) } as MessageEvent));
    expect(onMessage).toHaveBeenCalled();
  });
  
  it('handles invalid json payload safely', async () => {
    renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(() => {
      act(() => messageHandler?.({ data: 'invalid json' } as MessageEvent));
    }).not.toThrow();
  });

  it('handles connect edge case where we are not authenticated', async () => {
    const { isAuthenticated } = await import('../api-url');
    // @ts-expect-error Mock
    isAuthenticated.mockReturnValue(false);
    
    let constructed = false;
    vi.stubGlobal('WebSocket', class MockWS { close = vi.fn(); constructor() { constructed = true; } });

    renderHook(() => useChatWebSocket(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    
    expect(constructed).toBe(false); // It won't have created a WebSocket because isAuthenticated is false
    // @ts-expect-error Reset mock
    isAuthenticated.mockReturnValue(true);
  });


  it('schedules reconnect on unknown close code, and clears timer on open/unmount/reconnect', () => {
    vi.useFakeTimers();
    
    class MockWS {
      readyState = 1; send = vi.fn(); close = vi.fn(); addEventListener = vi.fn(); removeEventListener = vi.fn();
      _onopen?: () => void;
      _onclose?: (e: { code: number }) => void;
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        createdWs = this;
      }
      set onopen(handler: () => void) { this._onopen = handler; }
      set onclose(handler: (e: { code: number }) => void) { this._onclose = handler; }
    }
    let createdWs: MockWS | undefined;

    vi.stubGlobal('WebSocket', MockWS);

    const { result, unmount } = renderHook(() => useChatWebSocket(), { wrapper });
    
    // Unknown close -> triggers reconnect timeout
    act(() => {
      createdWs?._onclose?.({ code: 1006 });
    });
    expect(result.current.state).toBe(CHAT_STATES.AGENT_OFFLINE);

    // Call reconnect while the timer is STILL active (hits lines 300-301)
    act(() => {
      result.current.reconnect();
    });

    // Reconnecting sets state to init, and recreates ws. Let's close it again.
    act(() => {
      createdWs?._onclose?.({ code: 1006 });
    });

    // Advance timers so the setTimeout callback runs (hits lines 266-267)
    act(() => {
      vi.runAllTimers();
    });

    // It reconnects, so wait for the next open
    act(() => {
      createdWs?._onclose?.({ code: 1006 }); // Trigger again
    });

    // Open clears the active timer (hits lines 134-135)
    act(() => {
      createdWs?._onopen?.();
    });

    // Trigger one last time
    act(() => {
      createdWs?._onclose?.({ code: 1006 });
    });

    // Unmount clears the active timer (hits line 281)
    unmount();

    vi.useRealTimers();
  });

  it('connects with token if getAuthTokenForRequest returns a token', async () => {
    const { getAuthTokenForRequest } = await import('../api-url');
    // @ts-expect-error Mock
    getAuthTokenForRequest.mockReturnValueOnce('mock-token');

    let capturedUrl = '';
    vi.stubGlobal('WebSocket', class MockWS {
      constructor(url: string) {
        capturedUrl = url;
      }
      close = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
    });

    renderHook(() => useChatWebSocket(), { wrapper });
    
    expect(capturedUrl).toContain('token=mock-token');
  });

  it('handles optional chaining and state fallbacks gracefully', () => {
    let messageHandler: any;
    let closeHandler: any;
    vi.stubGlobal('WebSocket', class MockWS {
      readyState = 1; send = vi.fn(); close = vi.fn(); addEventListener = vi.fn(); removeEventListener = vi.fn();
      set onmessage(handler: any) { messageHandler = handler; }
      set onclose(handler: any) { closeHandler = handler; }
    });
    const onMessage = vi.fn();
    const onStreamEnd = vi.fn();
    const onThinkingCallbacks = {
      onReasoningStart: vi.fn(),
      onReasoningChunk: vi.fn(),
      onReasoningEnd: vi.fn(),
      onThinkingStep: vi.fn(),
      onToolOrFile: vi.fn(),
    };
    
    // Unmount previous and mount with callbacks
    const { result } = renderHook(() => useChatWebSocket(
      onMessage,
      undefined,
      undefined,
      onStreamEnd,
      onThinkingCallbacks,
      vi.fn()
    ), { wrapper });

    act(() => {
      messageHandler?.({ data: JSON.stringify({ type: 'auth_url_generated' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'auth_device_code' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'error' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'stream_chunk' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'reasoning_start' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'reasoning_end' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'reasoning_chunk', text: 'chunk' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'reasoning_chunk' }) } as MessageEvent); // branch: d.text ?? ''
      messageHandler?.({ data: JSON.stringify({ type: 'thinking_step', id: '1' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'thinking_step' }) } as MessageEvent); // branch: d.id ?? ''
      messageHandler?.({ data: JSON.stringify({ type: 'tool_call', name: 'tool' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'tool_call' }) } as MessageEvent); // branch: d.name ?? ''
      messageHandler?.({ data: JSON.stringify({ type: 'file_created', name: 'file' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'file_created' }) } as MessageEvent); // branch: d.name ?? ''
      messageHandler?.({ data: JSON.stringify({ type: 'activity_snapshot', activity: [{ id: '1' }] }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'queue_updated' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'stream_end' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'activity_appended', entry: { id: '2' } }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'activity_appended' }) } as MessageEvent); // no entry branch
      messageHandler?.({ data: JSON.stringify({ type: 'activity_updated' }) } as MessageEvent); // no entry
      messageHandler?.({ data: JSON.stringify({ type: 'activity_updated', entry: { id: '1', updated: true } }) } as MessageEvent); // matched ID
      messageHandler?.({ data: JSON.stringify({ type: 'activity_updated', entry: { id: 'unknown' } }) } as MessageEvent); // unmatched ID
      messageHandler?.({ data: JSON.stringify({ type: 'message', role: 'assistant' }) } as MessageEvent); // test role assistant
      messageHandler?.({ data: JSON.stringify({ type: 'message', role: 'user' }) } as MessageEvent); // test role user
      messageHandler?.({ data: JSON.stringify({ type: 'playground_changed' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'activity_snapshot', activity: 'not-an-array' }) } as MessageEvent); // snapshot not array branch
    });

    act(() => {
      // test existing reconnectTimer condition
      closeHandler?.({ code: 1006 } as CloseEvent);
      closeHandler?.({ code: 1006 } as CloseEvent); // already has reconnectTimerRef
    });

    // Test AUTH_PENDING state fallback
    act(() => {
      messageHandler?.({ data: JSON.stringify({ type: 'auth_url_generated' }) } as MessageEvent); 
      messageHandler?.({ data: JSON.stringify({ type: 'auth_status', status: 'unauthenticated' }) } as MessageEvent);
    });
    expect(result.current.state).toBe(CHAT_STATES.AUTH_PENDING);

    // Test AWAITING_RESPONSE state fallback
    act(() => {
      messageHandler?.({ data: JSON.stringify({ type: 'stream_start' }) } as MessageEvent);
      messageHandler?.({ data: JSON.stringify({ type: 'auth_status', status: 'authenticated', isProcessing: false }) } as MessageEvent);
    });
    expect(result.current.state).toBe(CHAT_STATES.AWAITING_RESPONSE);
  });
});
