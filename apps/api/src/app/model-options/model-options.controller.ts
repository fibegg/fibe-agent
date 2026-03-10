import { Controller, Get, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ConfigService } from '../config/config.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class ModelOptionsController {
  constructor(private readonly config: ConfigService) {}

  @Get('model-options')
  getOptions(): string[] {
    return this.config.getModelOptions();
  }
}
