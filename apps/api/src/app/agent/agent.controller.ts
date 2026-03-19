import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { SendMessageDto } from './dto/send-message.dto';
import { handleSendMessage } from './agent-send-message.handler';

@Controller('agent')
@UseGuards(AgentAuthGuard)
export class AgentController {
  constructor(private readonly orchestrator: OrchestratorService) {}

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
      body.images,
      body.attachmentFilenames
    );
    return handleSendMessage(result);
  }
}
