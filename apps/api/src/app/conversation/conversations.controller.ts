import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post } from '@nestjs/common';
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
import { InterruptAgentDto } from '../agent/dto/interrupt-agent.dto';
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
  create(@Body() body: { id?: string; conversationId?: string; conversation_id?: string; title?: string }): ConversationMeta {
    const requestedId = body?.id ?? body?.conversationId ?? body?.conversation_id;
    if (typeof requestedId === 'string' && requestedId.trim()) {
      try {
        return this.convManager.createWithId(requestedId, body?.title);
      } catch (err) {
        throw new BadRequestException(err instanceof Error ? err.message : 'invalid conversation id');
      }
    }
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

  /** Current non-durable runtime stream state for one conversation. */
  @Get(':id/live')
  live(@Param('id') id: string) {
    this.requireBundle(id);
    return this.sessionRegistry.liveConversationState(id);
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

  @Post(':id/agent/interrupt')
  @HttpCode(HttpStatus.ACCEPTED)
  interrupt(
    @Param('id') id: string,
    @Body() _body: InterruptAgentDto,
  ): ReturnType<OrchestratorService['interruptFromApi']> {
    this.requireBundle(id);
    return this.orchestrator.interruptFromApi(id);
  }

  @Delete(':id/queue/:turnId')
  removeQueuedTurn(
    @Param('id') id: string,
    @Param('turnId') turnId: string,
  ): { accepted: true; removed: boolean; conversationId?: string; queueCount?: number; messageId?: string } {
    this.requireBundle(id);
    return {
      accepted: true,
      ...this.orchestrator.removeQueuedTurnFromApi(id, turnId),
    };
  }

  @Patch(':id/queue/:turnId')
  async updateQueuedTurn(
    @Param('id') id: string,
    @Param('turnId') turnId: string,
    @Body() body: { text?: string; policy?: 'queue' | 'steer' },
  ): Promise<{ accepted: true; updated: boolean; conversationId?: string; queueCount?: number; messageId?: string }> {
    this.requireBundle(id);
    return {
      accepted: true,
      ...(await this.orchestrator.updateQueuedTurnFromApi(id, turnId, body)),
    };
  }

  @Post(':id/queue/reorder')
  reorderQueuedTurns(
    @Param('id') id: string,
    @Body() body: { turnIds?: string[]; turn_ids?: string[] },
  ): { accepted: true; reordered: boolean; conversationId?: string; queueCount?: number } {
    this.requireBundle(id);
    return {
      accepted: true,
      ...this.orchestrator.reorderQueuedTurnsFromApi(id, body.turnIds ?? body.turn_ids ?? []),
    };
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
