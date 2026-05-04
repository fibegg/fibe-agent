import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import {
  ConversationManagerService,
  DEFAULT_CONVERSATION_ID,
  INBOX_CONVERSATION_ID,
  type ConversationBundle,
  type ConversationMeta,
} from './conversation-manager.service';
import { enrichMessagesWithActivityUsage } from '../messages/enrich-messages-with-usage';
import { SessionRegistryService } from '../orchestrator/session-registry.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { SendMessageDto } from '../agent/dto/send-message.dto';
import { handleSendMessage } from '../agent/agent-send-message.handler';
import { WS_EVENT } from '@shared/ws-constants';
import { ProviderTrafficStoreService } from '../provider-traffic/provider-traffic-store.service';

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly convManager: ConversationManagerService,
    private readonly sessionRegistry: SessionRegistryService,
    private readonly orchestrator: OrchestratorService,
    private readonly providerTrafficStore: ProviderTrafficStoreService,
  ) {}

  // ── Core CRUD ─────────────────────────────────────────────────────────────

  /** List all conversations sorted by lastMessageAt desc. */
  @Get()
  list(): ConversationMeta[] {
    return this.convManager.list().map((meta) => ({
      ...meta,
      isProcessing: this.sessionRegistry.isConversationProcessing(meta.id),
    }));
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

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { title?: string },
  ): { ok: boolean } {
    if (!this.convManager.get(id)) {
      throw new NotFoundException('Conversation not found');
    }
    if (typeof body.title === 'string') {
      return { ok: this.convManager.setTitle(id, body.title) };
    }
    return { ok: true };
  }

  /** Delete a conversation and its workspace from disk. */
  @Delete(':id')
  delete(@Param('id') id: string): { ok: boolean } {
    if (id === DEFAULT_CONVERSATION_ID || id === INBOX_CONVERSATION_ID) {
      return { ok: false };
    }
    if (!this.convManager.get(id)) {
      throw new NotFoundException('Conversation not found');
    }
    this.sessionRegistry.broadcast(WS_EVENT.CONVERSATION_DELETED, { id });
    this.sessionRegistry.destroyConversation(id);
    return { ok: this.convManager.delete(id) };
  }

  // ── Messages & activities ─────────────────────────────────────────────────

  /** Load messages for one conversation (enriched with activity usage). */
  @Get(':id/messages')
  messages(@Param('id') id: string) {
    const bundle = this.requireBundle(id);
    return enrichMessagesWithActivityUsage(
      bundle.messageStore.all(),
      bundle.activityStore.all(),
    );
  }

  /** Load activity log for one conversation. */
  @Get(':id/activities')
  activities(@Param('id') id: string) {
    return this.requireBundle(id).activityStore.all();
  }

  @Get(':id/provider-traffic')
  providerTraffic(@Param('id') id: string) {
    this.requireBundle(id);
    return this.providerTrafficStore.all(id);
  }

  @Post(':id/agent/send-message')
  async sendMessage(
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ): Promise<{ accepted: true; messageId: string; resolvedPolicy?: string }> {
    this.requireBundle(id);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      throw new BadRequestException('text is required and must be non-empty');
    }
    const result = await this.orchestrator.sendMessageFromApi(
      text,
      id,
      body.images,
      body.attachmentFilenames,
      body.busyPolicy,
    );
    return handleSendMessage(result);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Resolve a ConversationBundle by id, throwing 404 when unknown. */
  private requireBundle(id: string): ConversationBundle {
    const bundle = id === DEFAULT_CONVERSATION_ID
      || id === INBOX_CONVERSATION_ID
      ? this.convManager.getOrCreate(id)
      : this.convManager.get(id);
    if (!bundle) throw new NotFoundException('Conversation not found');
    return bundle;
  }
}
