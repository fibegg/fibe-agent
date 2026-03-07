import { Controller, Get, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { MessagesService } from './messages.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('messages')
  getAll(): ReturnType<MessagesService['all']> {
    return this.messages.all();
  }
}
