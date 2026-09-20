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
    const { waitForAutoAuth } = await import('./postmessage-auth');
    const result = await waitForAutoAuth();
    expect(result).toBe(false);
  });

  it('resolves false after timeout when in iframe and no message received', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.removeItem('agent_password');

    const { waitForAutoAuth } = await import('./postmessage-auth');
    const promise = waitForAutoAuth();

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe(false);
  });

  it('resolves false immediately when already authenticated in iframe', async () => {
    localStorage.setItem('agent_password', 'mytoken');
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);

    // Since we have a token, isAuthenticated() from api-url returns true
    // The return is Promise.resolve(false) immediately only when NOT authenticated
    // When already auth'd, the module short-circuits → still returns false
    const { waitForAutoAuth: wfa } = await import('./postmessage-auth');
    const result = await wfa();
    expect(result).toBe(false);
  });

  it('resolves true immediately when auto_auth message arrived before waitForAutoAuth was called', async () => {
    // This is the key race condition fix: parent sends auto_auth before
    // LoginPage mounts and calls waitForAutoAuth()
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.removeItem('agent_password');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, token: 'tok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const mod = await import('./postmessage-auth');

    // Dispatch the auto_auth message BEFORE calling waitForAutoAuth
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { action: 'auto_auth', password: 'secret' },
      }),
    );

    await new Promise(process.nextTick);
    await vi.runAllTimersAsync();

    const result = await mod.waitForAutoAuth();
    expect(result).toBe(true);
  });

  it('dispatches a success event when auto_auth succeeds after the initial wait timed out', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.removeItem('agent_password');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, token: 'tok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const mod = await import('./postmessage-auth');
    const onSuccess = vi.fn();
    window.addEventListener(mod.AUTO_AUTH_SUCCESS_EVENT, onSuccess);

    const promise = mod.waitForAutoAuth();
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(false);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { action: 'auto_auth', password: 'secret' },
      }),
    );

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    window.removeEventListener(mod.AUTO_AUTH_SUCCESS_EVENT, onSuccess);
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
      new MessageEvent('message', {
        data: { action: 'other', password: 'pass' },
      }),
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
      new MessageEvent('message', {
        data: { action: 'auto_auth', password: 42 },
      }),
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
      new MessageEvent('message', {
        data: { action: 'auto_auth', password: 'secret' },
      }),
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(mockFetch).toHaveBeenCalled();
  });

  it('ignores duplicate auto_auth messages while login is in flight', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.removeItem('agent_password');

    let resolveLogin!: (v: Response) => void;
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolveLogin = r;
        }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const { waitForAutoAuth } = await import('./postmessage-auth');
    void waitForAutoAuth();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { action: 'auto_auth', password: 'secret' },
      }),
    );
    await Promise.resolve();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { action: 'auto_auth', password: 'secret' },
      }),
    );
    await Promise.resolve();

    // Only one fetch should have been made: second message ignored via authInFlight guard
    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveLogin({
      ok: true,
      json: async () => ({ success: true, token: 'tok' }),
    } as Response);
    await Promise.resolve();
    await Promise.resolve();
  });

  it('ignores auto_auth when already authenticated with the same token', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.setItem('agent_password', 'secret');

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await import('./postmessage-auth');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { action: 'auto_auth', password: 'secret' },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refreshes auto_auth when already authenticated with a stale token', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);
    localStorage.setItem('agent_password', 'old_token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, token: 'secret' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const mod = await import('./postmessage-auth');
    const onSuccess = vi.fn();
    window.addEventListener(mod.AUTO_AUTH_SUCCESS_EVENT, onSuccess);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { action: 'auto_auth', password: 'secret' },
      }),
    );

    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(localStorage.getItem('agent_password')).toBe('secret'),
    );
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    window.removeEventListener(mod.AUTO_AUTH_SUCCESS_EVENT, onSuccess);
  });
});
