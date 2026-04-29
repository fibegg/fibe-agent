import { Module } from '@nestjs/common';
import { LocalMcpService } from './local-mcp.service';
import { LocalMcpController } from './local-mcp.controller';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ConfigService } from '../config/config.service';

@Module({
  controllers: [LocalMcpController],
  providers: [LocalMcpService, AgentAuthGuard, ConfigService],
  exports: [LocalMcpService],
})
export class LocalMcpModule {}
