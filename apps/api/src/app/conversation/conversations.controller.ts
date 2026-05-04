import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import {
  ConversationManagerService,
  DEFAULT_CONVERSATION_ID,
  type ConversationMeta,
} from './conversation-manager.service';
import { enrichMessagesWithActivityUsage } from '../messages/enrich-messages-with-usage';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly convManager: ConversationManagerService) {}

  /** List all conversations sorted by lastMessageAt desc. */
  @Get()
  list(): ConversationMeta[] {
    return this.convManager.list();
  }

  /** Create a new conversation. */
  @Post()
  create(@Body() body: { title?: string }): ConversationMeta {
    return this.convManager.create(body?.title);
  }

  /** Load messages for one conversation. */
  @Get(':id/messages')
  messages(@Param('id') id: string) {
    const bundle = id === DEFAULT_CONVERSATION_ID
      ? this.convManager.getOrCreate(id)
      : this.convManager.get(id);
    if (!bundle) throw new NotFoundException('Conversation not found');
    return enrichMessagesWithActivityUsage(
      bundle.messageStore.all(),
      bundle.activityStore.all(),
    );
  }

  /** Load activities for one conversation. */
  @Get(':id/activities')
  activities(@Param('id') id: string) {
    const bundle = id === DEFAULT_CONVERSATION_ID
      ? this.convManager.getOrCreate(id)
      : this.convManager.get(id);
    if (!bundle) throw new NotFoundException('Conversation not found');
    return bundle.activityStore.all();
  }

  /** Rename a conversation. */
  @Patch(':id/title')
  setTitle(
    @Param('id') id: string,
    @Body() body: { title: string },
  ): { ok: boolean } {
    return { ok: this.convManager.setTitle(id, body.title) };
  }

  /** Delete a conversation. */
  @Delete(':id')
  delete(@Param('id') id: string): { ok: boolean } {
    return { ok: this.convManager.delete(id) };
  }
}
