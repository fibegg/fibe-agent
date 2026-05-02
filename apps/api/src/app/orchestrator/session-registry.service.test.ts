import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionRegistryService } from './session-registry.service';
import type { StrategyRegistryService } from '../strategies/strategy-registry.service';
import type { AgentStrategy } from '../strategies/strategy.types';

function makeStrategy(): AgentStrategy {
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
  } as unknown as AgentStrategy;
}

function makeStrategyRegistry(): StrategyRegistryService {
  return {
    resolveStrategy: vi.fn().mockImplementation(makeStrategy),
  } as unknown as StrategyRegistryService;
}

describe('SessionRegistryService', () => {
  let registry: SessionRegistryService;
  let strategyRegistry: StrategyRegistryService;

  beforeEach(() => {
    strategyRegistry = makeStrategyRegistry();
    registry = new SessionRegistryService(strategyRegistry);
  });

  it('starts with zero sessions', () => {
    expect(registry.size).toBe(0);
    expect(registry.all()).toHaveLength(0);
  });

  it('create() returns a SessionContext with a unique ID', () => {
    const ctx = registry.create();
    expect(ctx.sessionId).toBeTruthy();
    expect(typeof ctx.sessionId).toBe('string');
  });

  it('create() increments size', () => {
    registry.create();
    registry.create();
    expect(registry.size).toBe(2);
  });

  it('create() calls resolveStrategy() each time', () => {
    registry.create();
    registry.create();
    expect(strategyRegistry.resolveStrategy).toHaveBeenCalledTimes(2);
  });

  it('get() returns the session by ID', () => {
    const ctx = registry.create();
    expect(registry.get(ctx.sessionId)).toBe(ctx);
  });

  it('get() returns undefined for unknown ID', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('all() returns all active sessions', () => {
    const a = registry.create();
    const b = registry.create();
    const all = registry.all();
    expect(all).toContain(a);
    expect(all).toContain(b);
  });

  it('destroy() removes session from registry', () => {
    const ctx = registry.create();
    registry.destroy(ctx.sessionId);
    expect(registry.size).toBe(0);
    expect(registry.get(ctx.sessionId)).toBeUndefined();
  });

  it('destroy() calls ctx.destroy()', () => {
    const ctx = registry.create();
    const destroySpy = vi.spyOn(ctx, 'destroy');
    registry.destroy(ctx.sessionId);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('destroy() is a no-op for unknown sessionId', () => {
    expect(() => registry.destroy('unknown')).not.toThrow();
  });

  it('broadcast() emits to all active sessions', () => {
    const a = registry.create();
    const b = registry.create();

    const eventsA: Array<{ type: string }> = [];
    const eventsB: Array<{ type: string }> = [];
    a.outbound$.subscribe((e) => eventsA.push(e));
    b.outbound$.subscribe((e) => eventsB.push(e));

    registry.broadcast('test_broadcast', { value: 42 });

    expect(eventsA).toHaveLength(1);
    expect(eventsA[0]).toEqual({ type: 'test_broadcast', data: { value: 42 } });
    expect(eventsB).toHaveLength(1);
    expect(eventsB[0]).toEqual({ type: 'test_broadcast', data: { value: 42 } });
  });

  it('broadcast() does not emit to destroyed sessions', () => {
    const ctx = registry.create();
    const events: unknown[] = [];
    ctx.outbound$.subscribe({ next: (e) => events.push(e) });

    registry.destroy(ctx.sessionId);
    registry.broadcast('after_destroy', {});

    // stream was completed on destroy — no new events
    expect(events).toHaveLength(0);
  });

  it('broadcast() defaults data to empty object', () => {
    const ctx = registry.create();
    const events: Array<{ data: unknown }> = [];
    ctx.outbound$.subscribe((e) => events.push(e));

    registry.broadcast('ping');

    expect(events[0]?.data).toEqual({});
  });

  it('each created session has an independent outbound$ stream', () => {
    const a = registry.create();
    const b = registry.create();
    const eventsA: unknown[] = [];
    const eventsB: unknown[] = [];
    a.outbound$.subscribe((e) => eventsA.push(e));
    b.outbound$.subscribe((e) => eventsB.push(e));

    a.send('only_a', {});

    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(0);
  });
});
