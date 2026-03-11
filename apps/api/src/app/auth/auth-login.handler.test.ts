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
});
