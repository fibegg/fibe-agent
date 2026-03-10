import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
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
}
