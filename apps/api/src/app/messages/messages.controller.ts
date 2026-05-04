import { Controller, Get, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { enrichMessagesWithActivityUsage } from './enrich-messages-with-usage';
import { ConversationManagerService, DEFAULT_CONVERSATION_ID } from '../conversation/conversation-manager.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class MessagesController {
  constructor(
    private readonly conversationManager: ConversationManagerService,
  ) {}

  @Get('messages')
  getAll() {
    const bundle = this.conversationManager.getOrCreate(DEFAULT_CONVERSATION_ID);
    return enrichMessagesWithActivityUsage(
      bundle.messageStore.all(),
      bundle.activityStore.all()
    );
  }
}
