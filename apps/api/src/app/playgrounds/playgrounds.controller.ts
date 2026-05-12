import type { FastifyReply, FastifyRequest } from 'fastify';
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { contentTypeFromFilename } from '../uploads/uploads-handler';
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

  @Get('playgrounds/diff')
  async getDiff(@Query('file') file?: string) {
    return this.playgrounds.getGitFileDiff(file);
  }

  @Post('playgrounds/git-stage')
  @HttpCode(HttpStatus.OK)
  async stageGitFiles(@Body() body: { files?: string[]; confirm?: boolean }) {
    return this.playgrounds.stageGitFiles(body?.files ?? [], body?.confirm === true);
  }

  @Post('playgrounds/git-commit')
  @HttpCode(HttpStatus.OK)
  async commitGit(@Body() body: { message?: string; confirm?: boolean }) {
    return this.playgrounds.commitGit(body?.message ?? '', body?.confirm === true);
  }

  @Post('playgrounds/git-branch')
  @HttpCode(HttpStatus.OK)
  async branchGit(@Body() body: { create?: string }) {
    return this.playgrounds.branchGit(body?.create);
  }

  @Post('playgrounds/git-push')
  @HttpCode(HttpStatus.OK)
  async pushGit(@Body() body: { remote?: string; branch?: string; confirm?: boolean }) {
    return this.playgrounds.pushGit(body?.confirm === true, body?.remote, body?.branch);
  }

  @Post('playgrounds/git-pr')
  @HttpCode(HttpStatus.OK)
  async createDraftPr(@Body() body: { title?: string; body?: string; confirm?: boolean }) {
    return this.playgrounds.createDraftPrWithGh(body?.confirm === true, body?.title, body?.body);
  }

  @Get('playgrounds/file')
  async getFileContent(@Query('path') path: string) {
    if (!path || typeof path !== 'string') {
      return { content: '' };
    }
    const content = await this.playgrounds.getFileContent(path);
    return { content };
  }

  @Get('playgrounds/file/raw')
  async getRawFile(@Query('path') path: string, @Res() res: FastifyReply) {
    if (!path || typeof path !== 'string') {
      throw new NotFoundException('Invalid path');
    }
    const filePath = await this.playgrounds.getFilePath(path);
    res.header('Content-Type', contentTypeFromFilename(path));
    res.header('Content-Disposition', `inline; filename="${safeHeaderFilename(path.split('/').pop() ?? 'file')}"`);
    return res.send(createReadStream(filePath));
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

  @Post('playgrounds/upload')
  @HttpCode(HttpStatus.OK)
  async uploadFile(@Req() req: FastifyRequest, @Query('dir') dir?: string) {
    type MultipartFile = { filename: string; toBuffer: () => Promise<Buffer> };
    const data = await (req as unknown as { file: () => Promise<MultipartFile> }).file();
    if (!data) throw new NotFoundException('No file uploaded');
    const buffer = await data.toBuffer();
    const savedPath = await this.playgrounds.uploadFile(dir ?? '', data.filename, buffer);
    return { ok: true, path: savedPath };
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

function safeHeaderFilename(filename: string): string {
  return filename.replace(/[^\w.-]/g, '_');
}
