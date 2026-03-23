import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
}
