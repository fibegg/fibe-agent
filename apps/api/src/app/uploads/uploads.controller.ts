import type { FastifyReply, FastifyRequest } from 'fastify';
import { Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { processUploadFile, type MultipartFileResult } from './uploads-handler';
import { UploadsService } from './uploads.service';

@Controller('uploads')
@UseGuards(AgentAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Get(':filename')
  async getFile(@Param('filename') filename: string, @Res() res: FastifyReply) {
    const path = this.uploads.getPath(filename);
    if (!path) {
      return res.status(404).send();
    }
    const stream = createReadStream(path);
    return res.send(stream);
  }

  @Post()
  async uploadFile(@Req() req: FastifyRequest): Promise<{ filename: string }> {
    const data = await (req as unknown as { file: () => Promise<MultipartFileResult> }).file();
    return processUploadFile(data, (buffer, mimetype) =>
      this.uploads.saveFileFromBuffer(buffer, mimetype)
    );
  }
}
