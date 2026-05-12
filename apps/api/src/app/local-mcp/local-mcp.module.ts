import { Module } from '@nestjs/common';
import { LocalMcpService } from './local-mcp.service';
import { LocalMcpController } from './local-mcp.controller';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ConfigService } from '../config/config.service';
import { PlaygroundsService } from '../playgrounds/playgrounds.service';
import { PlayroomBrowserService } from '../playgrounds/playroom-browser.service';

@Module({
  controllers: [LocalMcpController],
  providers: [LocalMcpService, AgentAuthGuard, ConfigService, PlaygroundsService, PlayroomBrowserService],
  exports: [LocalMcpService],
})
export class LocalMcpModule {}
