import { Controller, Get, Req, Res, Next } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { serveIndexLogic } from './serve-index.util';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }

  @Get('*')
  serveIndex(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    return serveIndexLogic(req, res, next);
  }
}
