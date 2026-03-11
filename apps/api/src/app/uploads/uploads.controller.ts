import type { FastifyReply, FastifyRequest } from 'fastify';
import { BadRequestException, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { UploadsService } from './uploads.service';

const AUDIO_MIMES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus']);

type MultipartFileResult = { mimetype: string; toBuffer: () => Promise<Buffer> } | undefined;

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
    const data = await (req as { file: () => Promise<MultipartFileResult> }).file();
    if (!data) throw new BadRequestException('No file uploaded');
    const mimetype = data.mimetype ?? 'audio/webm';
    if (!AUDIO_MIMES.has(mimetype) && !mimetype.startsWith('audio/')) {
      throw new BadRequestException('Unsupported file type');
    }
    const buffer = await data.toBuffer();
    const filename = this.uploads.saveAudioFromBuffer(buffer, mimetype);
    return { filename };
  }
}
