import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '../config/config.service';
import { LoginDto } from './dto/login.dto';
import { handleLogin } from './auth-login.handler';

const LOGIN_RATE_LIMIT_TTL_MS = 60_000;
const LOGIN_RATE_LIMIT_MAX = 10;

@Controller('auth')
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  @Throttle({ default: { limit: LOGIN_RATE_LIMIT_MAX, ttl: LOGIN_RATE_LIMIT_TTL_MS } })
  @Post('login')
  login(@Body() body: LoginDto): { success: true; message?: string; token?: string } {
    return handleLogin(body, () => this.config.getAgentPassword());
  }
}
