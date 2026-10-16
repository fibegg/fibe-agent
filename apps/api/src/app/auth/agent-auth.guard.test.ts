import { describe, test, expect } from 'bun:test';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AgentAuthGuard } from './agent-auth.guard';

function createMockContext(req: {
  headers?: Record<string, string>;
  query?: Record<string, string>;
}): ExecutionContext {
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
    const ctx = createMockContext({
      headers: { authorization: 'Bearer secret' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  test('allows when query token matches', () => {
    const config = { getAgentPassword: () => 'secret' };
    const guard = new AgentAuthGuard(config as never);
    const ctx = createMockContext({ query: { token: 'secret' } });
    expect(guard.canActivate(ctx)).toBe(true);
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
    const ctx = createMockContext({
      headers: { authorization: 'Bearer wrong' },
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  test('rejects equal-length mismatches at either end of the credential', () => {
    const config = { getAgentPassword: () => 'a'.repeat(100) };
    const guard = new AgentAuthGuard(config as never);

    const shortMismatch = createMockContext({
      headers: { authorization: 'Bearer b' + 'a'.repeat(99) },
    });
    const longMismatch = createMockContext({
      headers: { authorization: 'Bearer ' + 'a'.repeat(99) + 'b' },
    });

    expect(() => guard.canActivate(shortMismatch)).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(longMismatch)).toThrow(
      UnauthorizedException,
    );
  });

  test('supports query credentials for existing browser transport compatibility', () => {
    const config = { getAgentPassword: () => 'secret' };
    const guard = new AgentAuthGuard(config as never);
    const ctx = createMockContext({ query: { token: 'secret' } });

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
