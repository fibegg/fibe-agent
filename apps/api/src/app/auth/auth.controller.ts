import { Body, Controller, Post } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { handleLogin } from './auth-login.handler';

@Controller('auth')
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  @Post('login')
  login(
    @Body() body: { password?: string }
  ): { success: true; message?: string; token?: string } {
    return handleLogin(body, () => this.config.getAgentPassword());
  }
}
