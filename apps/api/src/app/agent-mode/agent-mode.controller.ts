import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { AgentModeStoreService } from './agent-mode.store.service';
import { AGENT_MODE_KEYS } from '@shared/agent-mode.constants';

@Controller()
@UseGuards(AgentAuthGuard)
export class AgentModeController {
  constructor(
    private readonly agentModeStore: AgentModeStoreService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  @Get('agent-mode')
  getMode(): { mode: string } {
    return { mode: this.agentModeStore.get() };
  }

  @Post('agent-mode')
  @HttpCode(HttpStatus.OK)
  setMode(@Body() body: { mode?: string }): { success: true; mode: string } {
    const raw = body?.mode ?? '';
    const resolved = this.orchestrator.setAgentMode(raw);
    if (!resolved) {
      throw new BadRequestException(
        `Invalid mode "${raw}". Valid keys: ${AGENT_MODE_KEYS.join(', ')}`,
      );
    }
    return { success: true, mode: resolved };
  }
}
