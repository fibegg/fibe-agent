import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionContext } from './session-context';
import type { AgentStrategy } from '../strategies/strategy.types';

function makeStrategy(overrides: Partial<AgentStrategy> = {}): AgentStrategy {
  return {
    checkAuthStatus: vi.fn().mockResolvedValue(true),
    executeAuth: vi.fn(),
    submitAuthCode: vi.fn(),
    cancelAuth: vi.fn(),
    clearCredentials: vi.fn(),
    executeLogout: vi.fn(),
    executePromptStreaming: vi.fn().mockResolvedValue(undefined),
    ensureSettings: vi.fn(),
    interruptAgent: vi.fn(),
    ...overrides,
  } as unknown as AgentStrategy;
}

describe('SessionContext', () => {
  let strategy: AgentStrategy;
  let ctx: SessionContext;

  beforeEach(() => {
    strategy = makeStrategy();
    ctx = new SessionContext('test-id', strategy);
  });

  it('stores the given sessionId', () => {
    expect(ctx.sessionId).toBe('test-id');
  });

  it('starts with isAuthenticated=false and isProcessing=false', () => {
    expect(ctx.isAuthenticated).toBe(false);
    expect(ctx.isProcessing).toBe(false);
  });

  it('exposes the strategy', () => {
    expect(ctx.strategy).toBe(strategy);
  });

  it('send() emits on outbound$', () => {
    const received: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => received.push(ev));

    ctx.send('test_event', { foo: 'bar' });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'test_event', data: { foo: 'bar' } });
  });

  it('send() defaults data to empty object', () => {
    const received: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => received.push(ev));

    ctx.send('ping');

    expect(received[0]?.data).toEqual({});
  });

  it('destroy() calls interruptAgent on strategy', () => {
    ctx.destroy();
    expect(strategy.interruptAgent).toHaveBeenCalledTimes(1);
  });

  it('destroy() completes the outbound$ stream', () => {
    let completed = false;
    ctx.outbound$.subscribe({ complete: () => { completed = true; } });

    ctx.destroy();

    expect(completed).toBe(true);
  });

  it('destroy() does not throw if interruptAgent throws', () => {
    const throwingStrategy = makeStrategy({ interruptAgent: vi.fn().mockImplementation(() => { throw new Error('oops'); }) });
    const ctx2 = new SessionContext('x', throwingStrategy);
    expect(() => ctx2.destroy()).not.toThrow();
  });

  it('destroy() does not throw if interruptAgent is undefined', () => {
    const noInterruptStrategy = makeStrategy({ interruptAgent: undefined });
    const ctx2 = new SessionContext('x', noInterruptStrategy);
    expect(() => ctx2.destroy()).not.toThrow();
  });

  it('streaming scratch-pad fields initialise to defaults', () => {
    expect(ctx.currentActivityId).toBeNull();
    expect(ctx.reasoningTextAccumulated).toBe('');
    expect(ctx.lastStreamUsage).toBeUndefined();
    expect(ctx.cachedSystemPromptFromFile).toBeNull();
    expect(ctx.mcpToolsCache).toBeNull();
  });
});
