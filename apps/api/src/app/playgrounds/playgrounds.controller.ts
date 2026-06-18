import type { FastifyReply, FastifyRequest } from 'fastify';
import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { contentTypeFromFilename } from '../uploads/uploads-handler';
import { PlaygroundsService } from './playgrounds.service';
import { PlayroomBrowserService } from './playroom-browser.service';
import { diagnosePreviewUrl } from './preview-diagnostics';

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
  async getUrls(@Query('playground') playground?: string) {
    const urls = await this.playgrounds.getUrls(playground);
    return { urls };
  }

  @Get('playgrounds/repos')
  async getRepos() {
    const repos = await this.playgrounds.getRepos();
    return { repos };
  }

  @Get('playgrounds/preview-diagnostics')
  async getPreviewDiagnostics(@Query('url') url?: string) {
    if (!url || typeof url !== 'string') {
      throw new BadRequestException('Preview URL is required');
    }
    try {
      return await diagnosePreviewUrl(url);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid preview URL');
    }
  }

  @Get('playgrounds/diff')
  async getDiff(@Query('file') file?: string, @Query('repo') repo?: string) {
    return this.playgrounds.getGitFileDiff(file, repo);
  }

  @Post('playgrounds/git-stage')
  @HttpCode(HttpStatus.OK)
  async stageGitFiles(@Body() body: { files?: string[]; confirm?: boolean; repo?: string }) {
    return this.gitOperation(() => this.playgrounds.stageGitFiles(body?.files ?? [], body?.confirm === true, body?.repo));
  }

  @Post('playgrounds/git-commit')
  @HttpCode(HttpStatus.OK)
  async commitGit(@Body() body: { message?: string; confirm?: boolean; repo?: string }) {
    return this.gitOperation(() => this.playgrounds.commitGit(body?.message ?? '', body?.confirm === true, body?.repo));
  }

  @Post('playgrounds/git-branch')
  @HttpCode(HttpStatus.OK)
  async branchGit(@Body() body: { create?: string; repo?: string }) {
    return this.gitOperation(() => this.playgrounds.branchGit(body?.create, body?.repo));
  }

  @Post('playgrounds/git-push')
  @HttpCode(HttpStatus.OK)
  async pushGit(@Body() body: { remote?: string; branch?: string; confirm?: boolean; repo?: string }) {
    return this.gitOperation(() => this.playgrounds.pushGit(body?.confirm === true, body?.remote, body?.branch, body?.repo));
  }

  @Post('playgrounds/git-pr')
  @HttpCode(HttpStatus.OK)
  async createDraftPr(@Body() body: { title?: string; body?: string; confirm?: boolean; repo?: string }) {
    return this.gitOperation(() => this.playgrounds.createDraftPrWithGh(body?.confirm === true, body?.title, body?.body, body?.repo));
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

  @Post('playrooms/unlink')
  @HttpCode(HttpStatus.OK)
  async unlinkPlayroom(@Body() body: { confirm?: boolean }) {
    await this.playroomBrowser.unlinkPlayground(body?.confirm === true);
    return { ok: true };
  }

  @Get('playrooms/current')
  async getCurrentPlayroom() {
    const current = await this.playroomBrowser.getCurrentLink();
    return { current };
  }

  private async gitOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Git operation failed');
    }
  }
}

function safeHeaderFilename(filename: string): string {
  return filename.replace(/[^\w.-]/g, '_');
}
