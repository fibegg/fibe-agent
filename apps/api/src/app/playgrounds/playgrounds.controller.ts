import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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

  @Get('playgrounds/file')
  getFileContent(@Query('path') path: string) {
    if (!path || typeof path !== 'string') {
      return { content: '' };
    }
    return { content: this.playgrounds.getFileContent(path) };
  }
}
