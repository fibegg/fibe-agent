import { Controller, Get, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ConfigService } from '../config/config.service';
import { readPostInitState } from '../../post-init-runner';
import {
  buildInitStatusResponse,
  type InitStatusResponse,
} from './init-status.logic';

export type { InitStatusResponse } from './init-status.logic';

@Controller()
@UseGuards(AgentAuthGuard)
export class InitStatusController {
  constructor(private readonly config: ConfigService) {}

  @Get('init-status')
  getStatus(): InitStatusResponse {
    const script = this.config.getPostInitScript();
    const dataDir = this.config.getConversationDataDir();
    const stateFile = readPostInitState(dataDir);
    return buildInitStatusResponse(script, stateFile);
  }
}
