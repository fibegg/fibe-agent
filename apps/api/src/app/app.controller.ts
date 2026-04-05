import { Controller, Get, Req, Res, Next } from '@nestjs/common';
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { serveIndexLogic } from './serve-index.util';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }

  @Get('*')
  serveIndex(@Req() req: FastifyRequest, @Res() res: FastifyReply, @Next() next: HookHandlerDoneFunction) {
    return serveIndexLogic(req, res, next);
  }
}
