import type { FastifyRequest } from 'fastify';
import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { AgentFilesService } from './agent-files.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class AgentFilesController {
  constructor(private readonly agentFiles: AgentFilesService) {}

  @Get('agent-files')
  async getTree() {
    return this.agentFiles.getTree();
  }

  @Get('agent-files/stats')
  async getStats() {
    return this.agentFiles.getStats();
  }

  @Get('agent-files/file')
  async getFileContent(@Query('path') path: string) {
    if (!path || typeof path !== 'string') {
      return { content: '' };
    }
    const content = await this.agentFiles.getFileContent(path);
    return { content };
  }

  @Post('agent-files/upload')
  @HttpCode(HttpStatus.OK)
  async uploadFile(@Req() req: FastifyRequest, @Query('dir') dir?: string) {
    type MultipartFile = { filename: string; toBuffer: () => Promise<Buffer> };
    const data = await (req as unknown as { file: () => Promise<MultipartFile> }).file();
    if (!data) throw new NotFoundException('No file uploaded');
    const buffer = await data.toBuffer();
    const savedPath = await this.agentFiles.uploadFile(dir ?? '', data.filename, buffer);
    return { ok: true, path: savedPath };
  }
}
