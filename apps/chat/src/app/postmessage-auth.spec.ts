import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('waitForAutoAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('resolves false immediately when window === window.parent (default jsdom)', async () => {
    // In jsdom, window.parent === window, so the function should return immediately
    const { waitForAutoAuth } = await import('./postmessage-auth');
    const result = await waitForAutoAuth();
    expect(result).toBe(false);
  });

  it('resolves false after timeout when in iframe and no message received', async () => {
    // Simulate iframe: window !== window.parent
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.removeItem('agent_password');

    const { waitForAutoAuth } = await import('./postmessage-auth');
    const promise = waitForAutoAuth();

    // Advance past AUTO_AUTH_TIMEOUT_MS (3000ms)
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe(false);
  });

  it('resolves false immediately when already authenticated in iframe', async () => {
    // Set a token so isAuthenticated() returns true
    localStorage.setItem('agent_password', 'mytoken');
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);

    // Since we have a token, isAuthenticated() from api-url returns true
    // The return is Promise.resolve(false) immediately only when NOT authenticated
    // When already auth'd, the module short-circuits → still returns false
    const { waitForAutoAuth: wfa } = await import('./postmessage-auth');
    const result = await wfa();
    // With fake parent but already authenticated: Promise.resolve(false)
    expect(result).toBe(false);
  });
});

describe('postmessage-auth onMessage handler', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('ignores messages with wrong action', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.removeItem('agent_password');

    const { waitForAutoAuth } = await import('./postmessage-auth');
    const promise = waitForAutoAuth();

    window.dispatchEvent(
      new MessageEvent('message', { data: { action: 'other', password: 'pass' } })
    );

    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(false);
  });

  it('ignores messages with non-string password', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.removeItem('agent_password');

    const { waitForAutoAuth } = await import('./postmessage-auth');
    const promise = waitForAutoAuth();

    window.dispatchEvent(
      new MessageEvent('message', { data: { action: 'auto_auth', password: 42 } })
    );

    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(false);
  });

  it('ignores messages with null data', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.removeItem('agent_password');

    const { waitForAutoAuth } = await import('./postmessage-auth');
    const promise = waitForAutoAuth();

    window.dispatchEvent(new MessageEvent('message', { data: null }));

    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(false);
  });

  it('calls loginWithPassword when valid auto_auth message dispatched', async () => {
    // This test verifies the message handler calls the login API
    // by checking that fetch is invoked (loginWithPassword uses apiRequest which uses fetch)
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.removeItem('agent_password');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, token: 'tok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Import module fresh so the message listener is attached (due to window.parent being different)
    const { waitForAutoAuth } = await import('./postmessage-auth');
    void waitForAutoAuth(); // start listening

    window.dispatchEvent(
      new MessageEvent('message', { data: { action: 'auto_auth', password: 'secret' } })
    );

    // Give microtasks a chance to run
    await Promise.resolve();
    await Promise.resolve();

    // The fetch call should have been made (login attempted)
    // Note: timing may vary due to fake timers; we verify the intent
    expect(mockFetch).toHaveBeenCalled();
  });
});
