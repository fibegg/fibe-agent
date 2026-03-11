import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  @Post('login')
  login(
    @Body() body: { password?: string }
  ): { success: true; message?: string; token?: string } {
    const requiredPassword = this.config.getAgentPassword();
    if (!requiredPassword) {
      return { success: true, message: 'No authentication required' };
    }
    const providedPassword = body?.password;
    if (providedPassword === requiredPassword) {
      return { success: true, token: providedPassword };
    }
    throw new UnauthorizedException('Invalid password');
  }
}
