import { Controller, Get, Req, Res, Next } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import { serveIndexLogic } from './serve-index.util';

@Controller()
export class AppController {
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }

  @Get('*')
  serveIndex(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    return serveIndexLogic(req, res, next);
  }
}
