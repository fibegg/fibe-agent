import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Put, Query, UseGuards } from '@nestjs/common';
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

  @Put('playgrounds/file')
  @HttpCode(HttpStatus.OK)
  async saveFileContent(
    @Body() body: { path?: string; content?: string },
  ) {
    const { path, content } = body ?? {};
    if (!path || typeof path !== 'string') {
      throw new NotFoundException('Invalid path');
    }
    if (typeof content !== 'string') {
      throw new NotFoundException('Invalid content');
    }
    await this.playgrounds.saveFileContent(path, content);
    return { ok: true };
  }
}
