import { Controller, Get, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { PlaygroundsService } from './playgrounds.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class PlaygroundsController {
  constructor(private readonly playgrounds: PlaygroundsService) {}

  @Get('playgrounds')
  getTree() {
    return this.playgrounds.getTree();
  }
}
