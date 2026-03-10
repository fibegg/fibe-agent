import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ConfigService } from '../config/config.service';

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPassword = this.config.getAgentPassword();
    if (!requiredPassword) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    let token: string | null = null;

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      const query = request.query as Record<string, string | undefined>;
      token = query?.token ?? null;
    }

    if (token === requiredPassword) {
      return true;
    }

    throw new UnauthorizedException('Unauthorized');
  }
}
