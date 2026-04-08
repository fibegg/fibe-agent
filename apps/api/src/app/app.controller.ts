import { Controller, Get, Req, Res, Next, Post, Body } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { serveIndexLogic } from './serve-index.util';
import { OrchestratorService } from './orchestrator/orchestrator.service';

@Controller()
export class AppController {
  constructor(private readonly orchestrator: OrchestratorService) {}

  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }

  @Post('agent-mode')
  setAgentMode(@Body() body: { mode: string }) {
    if (body.mode) {
      this.orchestrator.setAgentMode(body.mode);
    }
    return { success: true, mode: body.mode };
  }

  @Get('*')
  serveIndex(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    return serveIndexLogic(req, res, next);
  }
}
