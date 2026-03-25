import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuditService } from './audit.service';
import { FastifyRequest } from 'fastify';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    
    // Only audit mutating or sensitive requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const actor = req.headers.authorization ? 'AuthenticatedUser' : 'Anonymous';
      const action = req.method;
      const resource = req.url;
      
      // Async fire-and-forget logging
      this.auditService.logEvent(action, resource, actor).catch(() => undefined);
    }
    
    return next.handle();
  }
}
