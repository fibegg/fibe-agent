import type { FastifyReply, FastifyRequest } from 'fastify';
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { contentTypeFromFilename } from '../uploads/uploads-handler';
import { AgentFilesService } from './agent-files.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class AgentFilesController {
  constructor(private readonly agentFiles: AgentFilesService) {}

  @Get('agent-files')
  async getTree(@Query('conversationId') conversationId?: string) {
    return this.agentFiles.getTree(conversationId);
  }

  @Get('agent-files/stats')
  async getStats(@Query('conversationId') conversationId?: string) {
    return this.agentFiles.getStats(conversationId);
  }

  @Get('agent-files/file')
  async getFileContent(
    @Query('path') path: string,
    @Query('conversationId') conversationId?: string,
  ) {
    if (!path || typeof path !== 'string') {
      return { content: '' };
    }
    const content = await this.agentFiles.getFileContent(path, conversationId);
    return { content };
  }

  @Get('agent-files/file/raw')
  async getRawFile(
    @Query('path') path: string,
    @Query('conversationId') conversationId: string | undefined,
    @Res() res: FastifyReply,
  ) {
    if (!path || typeof path !== 'string') {
      throw new NotFoundException('Invalid path');
    }
    const filePath = await this.agentFiles.getFilePath(path, conversationId);
    res.header('Content-Type', contentTypeFromFilename(path));
    res.header('Content-Disposition', `inline; filename="${safeHeaderFilename(path.split('/').pop() ?? 'file')}"`);
    return res.send(createReadStream(filePath));
  }

  @Put('agent-files/file')
  @HttpCode(HttpStatus.OK)
  async saveFileContent(
    @Body() body: { path?: string; content?: string },
    @Query('conversationId') conversationId?: string,
  ) {
    const { path, content } = body ?? {};
    if (!path || typeof path !== 'string') {
      throw new NotFoundException('Invalid path');
    }
    if (typeof content !== 'string') {
      throw new NotFoundException('Invalid content');
    }
    await this.agentFiles.saveFileContent(path, content, conversationId);
    return { ok: true };
  }

  @Post('agent-files/upload')
  @HttpCode(HttpStatus.OK)
  async uploadFile(
    @Req() req: FastifyRequest,
    @Query('dir') dir?: string,
    @Query('conversationId') conversationId?: string,
  ) {
    type MultipartFile = { filename: string; toBuffer: () => Promise<Buffer> };
    const data = await (req as unknown as { file: () => Promise<MultipartFile> }).file();
    if (!data) throw new NotFoundException('No file uploaded');
    const buffer = await data.toBuffer();
    const savedPath = await this.agentFiles.uploadFile(dir ?? '', data.filename, buffer, conversationId);
    return { ok: true, path: savedPath };
  }
}

function safeHeaderFilename(filename: string): string {
  return filename.replace(/[^\w.-]/g, '_');
}
