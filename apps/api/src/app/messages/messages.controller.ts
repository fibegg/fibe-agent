import { Controller, Get, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { MessageStoreService } from '../message-store/message-store.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class MessagesController {
  constructor(private readonly messageStore: MessageStoreService) {}

  @Get('messages')
  getAll() {
    return this.messageStore.all();
  }
}
