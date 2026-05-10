import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { SendMessageDto } from './dto/send-message.dto';
import { InterruptAgentDto } from './dto/interrupt-agent.dto';
import { handleSendMessage } from './agent-send-message.handler';

@Controller('agent')
@UseGuards(AgentAuthGuard)
export class AgentController {
  constructor(
    private readonly orchestrator: OrchestratorService,
  ) {}

  @Get('status')
  getStatus(): {
    authenticated: boolean;
    isProcessing: boolean;
    queueCount: number;
  } {
    return {
      authenticated: this.orchestrator.isAuthenticated,
      isProcessing: this.orchestrator.isProcessing,
      queueCount: this.orchestrator.queueCount,
    };
  }

  @Post('send-message')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendMessage(
    @Body() body: SendMessageDto
  ): Promise<{ accepted: true; messageId: string }> {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      throw new BadRequestException('text is required and must be non-empty');
    }
    const result = await this.orchestrator.sendMessageFromApi(
      text,
      body.conversationId,
      body.images,
      body.attachmentFilenames,
      body.busyPolicy,
    );
    return handleSendMessage(result);
  }

  @Post('interrupt')
  @HttpCode(HttpStatus.ACCEPTED)
  interrupt(
    @Body() body: InterruptAgentDto
  ): { accepted: true; interrupted: boolean; conversationId?: string } {
    return {
      accepted: true,
      ...this.orchestrator.interruptFromApi(body.conversationId),
    };
  }

  @Delete('queue/:turnId')
  removeQueuedTurn(
    @Param('turnId') turnId: string,
    @Body() body: { conversationId?: string; conversation_id?: string },
  ): { accepted: true; removed: boolean; conversationId?: string; queueCount?: number; messageId?: string } {
    return {
      accepted: true,
      ...this.orchestrator.removeQueuedTurnFromApi(body.conversationId ?? body.conversation_id, turnId),
    };
  }

  @Patch('queue/:turnId')
  async updateQueuedTurn(
    @Param('turnId') turnId: string,
    @Body() body: { conversationId?: string; conversation_id?: string; text?: string; policy?: 'queue' | 'steer' },
  ): Promise<{ accepted: true; updated: boolean; conversationId?: string; queueCount?: number; messageId?: string }> {
    return {
      accepted: true,
      ...(await this.orchestrator.updateQueuedTurnFromApi(body.conversationId ?? body.conversation_id, turnId, {
        text: body.text,
        policy: body.policy,
      })),
    };
  }

  @Post('queue/reorder')
  reorderQueuedTurns(
    @Body() body: { conversationId?: string; conversation_id?: string; turnIds?: string[]; turn_ids?: string[] },
  ): { accepted: true; reordered: boolean; conversationId?: string; queueCount?: number } {
    return {
      accepted: true,
      ...this.orchestrator.reorderQueuedTurnsFromApi(body.conversationId ?? body.conversation_id, body.turnIds ?? body.turn_ids ?? []),
    };
  }
}
