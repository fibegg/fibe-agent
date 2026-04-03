import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('postmessage-greeting', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('does not attach listener when window === window.parent (default jsdom)', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    await import('./postmessage-greeting');
    const messageCalls = addSpy.mock.calls.filter(([type]) => type === 'message');
    // In jsdom, window.parent === window — no listener should be attached
    expect(messageCalls).toHaveLength(0);
  });

  it('stores greeting text from valid initial_greeting message', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);

    const { consumeGreeting } = await import('./postmessage-greeting');

    window.dispatchEvent(
      new MessageEvent('message', { data: { action: 'initial_greeting', text: '[SYSCHECK]' } })
    );

    expect(consumeGreeting()).toBe('[SYSCHECK]');
  });

  it('consumeGreeting returns text once then returns null', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);

    const { consumeGreeting } = await import('./postmessage-greeting');

    window.dispatchEvent(
      new MessageEvent('message', { data: { action: 'initial_greeting', text: '[SYSCHECK]' } })
    );

    expect(consumeGreeting()).toBe('[SYSCHECK]');
    expect(consumeGreeting()).toBeNull();
  });

  it('only stores the first greeting (ignores retries)', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);

    const { consumeGreeting } = await import('./postmessage-greeting');

    window.dispatchEvent(
      new MessageEvent('message', { data: { action: 'initial_greeting', text: 'first' } })
    );
    window.dispatchEvent(
      new MessageEvent('message', { data: { action: 'initial_greeting', text: 'second' } })
    );

    expect(consumeGreeting()).toBe('first');
  });

  it('ignores messages with wrong action', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);

    const { consumeGreeting } = await import('./postmessage-greeting');

    window.dispatchEvent(
      new MessageEvent('message', { data: { action: 'auto_auth', text: '[SYSCHECK]' } })
    );

    expect(consumeGreeting()).toBeNull();
  });

  it('ignores messages with non-string text', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);

    const { consumeGreeting } = await import('./postmessage-greeting');

    window.dispatchEvent(
      new MessageEvent('message', { data: { action: 'initial_greeting', text: 42 } })
    );

    expect(consumeGreeting()).toBeNull();
  });

  it('ignores messages with null data', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);

    const { consumeGreeting } = await import('./postmessage-greeting');

    window.dispatchEvent(new MessageEvent('message', { data: null }));

    expect(consumeGreeting()).toBeNull();
  });

  it('peekGreeting returns text without consuming it', async () => {
    const fakeParent = {} as Window;
    vi.stubGlobal('parent', fakeParent);

    const { peekGreeting, consumeGreeting } = await import('./postmessage-greeting');

    window.dispatchEvent(
      new MessageEvent('message', { data: { action: 'initial_greeting', text: '[SYSCHECK]' } })
    );

    expect(peekGreeting()).toBe('[SYSCHECK]');
    expect(peekGreeting()).toBe('[SYSCHECK]'); // still there
    expect(consumeGreeting()).toBe('[SYSCHECK]'); // consumed
    expect(peekGreeting()).toBeNull(); // now gone
  });
});
