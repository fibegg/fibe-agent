import { describe, test, expect } from 'bun:test';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  test('login returns success when no password required', () => {
    const config = { getAgentPassword: () => undefined as string | undefined };
    const controller = new AuthController(config as never);
    expect(controller.login({})).toEqual({ success: true, message: 'No authentication required' });
  });

  test('login returns token when password matches', () => {
    const config = { getAgentPassword: () => 'secret' };
    const controller = new AuthController(config as never);
    expect(controller.login({ password: 'secret' })).toEqual({ success: true, token: 'secret' });
  });

  test('login throws when password wrong', () => {
    const config = { getAgentPassword: () => 'secret' };
    const controller = new AuthController(config as never);
    expect(() => controller.login({ password: 'wrong' })).toThrow('Invalid password');
  });
});
