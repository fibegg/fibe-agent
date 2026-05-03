import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ConversationManagerService, type ConversationMeta } from './conversation-manager.service';

@Controller('api/conversations')
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
