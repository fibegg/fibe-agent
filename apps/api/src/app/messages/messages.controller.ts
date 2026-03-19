import { Controller, Get, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ActivityStoreService } from '../activity-store/activity-store.service';
import { MessageStoreService } from '../message-store/message-store.service';
import { enrichMessagesWithActivityUsage } from './enrich-messages-with-usage';

@Controller()
@UseGuards(AgentAuthGuard)
export class MessagesController {
  constructor(
    private readonly messageStore: MessageStoreService,
    private readonly activityStore: ActivityStoreService,
  ) {}

  @Get('messages')
  getAll() {
    return enrichMessagesWithActivityUsage(
      this.messageStore.all(),
      this.activityStore.all()
    );
  }
}
