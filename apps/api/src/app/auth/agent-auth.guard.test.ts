import { describe, test, expect } from 'bun:test';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AgentAuthGuard } from './agent-auth.guard';

function createMockContext(req: { headers?: Record<string, string>; query?: Record<string, string> }): ExecutionContext {
  const request = {
    headers: req.headers ?? {},
    query: req.query ?? {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AgentAuthGuard', () => {
  test('allows when no password required', () => {
    const config = { getAgentPassword: () => undefined as string | undefined };
    const guard = new AgentAuthGuard(config as never);
    const ctx = createMockContext({});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  test('allows when Bearer token matches', () => {
    const config = { getAgentPassword: () => 'secret' };
    const guard = new AgentAuthGuard(config as never);
    const ctx = createMockContext({ headers: { authorization: 'Bearer secret' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  test('rejects when query token matches (deprecated)', () => {
    const config = { getAgentPassword: () => 'secret' };
    const guard = new AgentAuthGuard(config as never);
    const ctx = createMockContext({ query: { token: 'secret' } });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  test('throws when password required and token missing', () => {
    const config = { getAgentPassword: () => 'secret' };
    const guard = new AgentAuthGuard(config as never);
    const ctx = createMockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  test('throws when token does not match', () => {
    const config = { getAgentPassword: () => 'secret' };
    const guard = new AgentAuthGuard(config as never);
    const ctx = createMockContext({ headers: { authorization: 'Bearer wrong' } });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
