import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { LocalMcpService } from './local-mcp.service';
import type { LocalToolCallRequest, LocalToolCallResponse } from './local-mcp-types';

/**
 * LocalMcpController
 *
 * Exposes POST /api/local-tool-call which the stdio MCP child process calls
 * via HTTP loopback whenever the agent invokes a local tool.
 *
 * The endpoint is guarded by AgentAuthGuard so that only requests with a
 * valid bearer token (or no password configured) are accepted.
 */
@UseGuards(AgentAuthGuard)
@Controller('api/local-tool-call')
export class LocalMcpController {
  constructor(private readonly localMcp: LocalMcpService) {}

  @Post()
  async handleToolCall(
    @Body() body: LocalToolCallRequest,
  ): Promise<LocalToolCallResponse> {
    return this.localMcp.handleToolCall(body);
  }
}
