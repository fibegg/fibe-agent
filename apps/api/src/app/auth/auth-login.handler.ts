import { UnauthorizedException } from '@nestjs/common';

export type LoginResult = { success: true; message?: string; token?: string };

export function handleLogin(
  body: { password?: string },
  getRequiredPassword: () => string | undefined
): LoginResult {
  const requiredPassword = getRequiredPassword();
  if (!requiredPassword) {
    return { success: true, message: 'No authentication required' };
  }
  const providedPassword = body?.password;
  if (providedPassword === requiredPassword) {
    return { success: true, token: providedPassword };
  }
  throw new UnauthorizedException('Invalid password');
}
