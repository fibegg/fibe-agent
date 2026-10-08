import { ConflictException, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ConfigService } from '../config/config.service';
import { PostInitConflict, readPostInitState, retryPostInitFailed } from '../../post-init-runner';
import {
  buildInitStatusResponse,
  type InitStatusResponse,
} from './init-status.logic';

export type { InitStatusResponse } from './init-status.logic';

@Controller()
@UseGuards(AgentAuthGuard)
export class InitStatusController {
  constructor(private readonly config: ConfigService) {}

  @Post('init-status/retry')
  retry(): InitStatusResponse {
    try {
      void retryPostInitFailed(this.config.getConversationDataDir(), this.config.getPostInitScript(), this.config.getPlaygroundsDir());
      return this.getStatus();
    } catch (error) {
      if (error instanceof PostInitConflict) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get('init-status')
  getStatus(): InitStatusResponse {
    const script = this.config.getPostInitScript();
    const systemPrompt = this.config.getSystemPrompt();
    const dataDir = this.config.getConversationDataDir();
    const stateFile = readPostInitState(dataDir);
    return buildInitStatusResponse(script, systemPrompt, stateFile);
  }
}
