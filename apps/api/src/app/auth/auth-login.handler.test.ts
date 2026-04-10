import { describe, test, expect } from 'bun:test';
import { UnauthorizedException } from '@nestjs/common';
import { handleLogin } from './auth-login.handler';

describe('handleLogin', () => {
  test('returns success when no password required', () => {
    expect(handleLogin({}, () => undefined)).toEqual({
      success: true,
      message: 'No authentication required',
    });
  });

  test('returns token when password matches', () => {
    expect(handleLogin({ password: 'secret' }, () => 'secret')).toEqual({
      success: true,
      token: 'secret',
    });
  });

  test('throws when password wrong', () => {
    expect(() => handleLogin({ password: 'wrong' }, () => 'secret')).toThrow(
      UnauthorizedException
    );
  });

  test('OWASP A02: token returned on login IS the plaintext password (CWE-256)', () => {
    const result = handleLogin({ password: 'my-secret-password' }, () => 'my-secret-password');

    expect(result.token).toBe('my-secret-password');
  });

  test('OWASP A02: token equals the exact AGENT_PASSWORD value', () => {
    const agentPassword = 'super-secret-agent-pwd-123';
    const result = handleLogin({ password: agentPassword }, () => agentPassword);

    expect(result.token).toBe(agentPassword);
  });
});
