import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { PlaygroundsService } from './playgrounds.service';
import { PlayroomBrowserService } from './playroom-browser.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class PlaygroundsController {
  constructor(
    private readonly playgrounds: PlaygroundsService,
    private readonly playroomBrowser: PlayroomBrowserService,
  ) {}

  @Get('playgrounds')
  async getTree() {
    return this.playgrounds.getTree();
  }

  @Get('playgrounds/stats')
  async getStats() {
    return this.playgrounds.getStats();
  }

  @Get('playgrounds/urls')
  async getUrls() {
    const urls = await this.playgrounds.getUrls();
    return { urls };
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

  @Get('playrooms/browse')
  async browsePlayrooms(@Query('path') path?: string) {
    return this.playroomBrowser.browse(path ?? '');
  }

  @Post('playrooms/link')
  @HttpCode(HttpStatus.OK)
  async linkPlayroom(@Body() body: { path?: string }) {
    const { path } = body ?? {};
    if (!path || typeof path !== 'string') {
      throw new NotFoundException('Invalid path');
    }
    const result = await this.playroomBrowser.linkPlayground(path);
    return { ok: true, ...result };
  }

  @Get('playrooms/current')
  async getCurrentPlayroom() {
    const current = await this.playroomBrowser.getCurrentLink();
    return { current };
  }
}
