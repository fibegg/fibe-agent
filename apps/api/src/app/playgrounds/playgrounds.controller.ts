import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { PlaygroundsService } from './playgrounds.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class PlaygroundsController {
  constructor(private readonly playgrounds: PlaygroundsService) {}

  @Get('playgrounds')
  async getTree() {
    return this.playgrounds.getTree();
  }

  @Get('playgrounds/stats')
  async getStats() {
    return this.playgrounds.getStats();
  }

  @Get('playgrounds/file')
  async getFileContent(@Query('path') path: string) {
    if (!path || typeof path !== 'string') {
      return { content: '' };
    }
    const content = await this.playgrounds.getFileContent(path);
    return { content };
  }
}
