import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import {
  ConversationManagerService,
  DEFAULT_CONVERSATION_ID,
  type ConversationBundle,
  type ConversationMeta,
} from './conversation-manager.service';
import { enrichMessagesWithActivityUsage } from '../messages/enrich-messages-with-usage';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly convManager: ConversationManagerService) {}

  // ── Core CRUD ─────────────────────────────────────────────────────────────

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

  /** Delete a conversation and its workspace from disk. */
  @Delete(':id')
  delete(@Param('id') id: string): { ok: boolean } {
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

  // ── Per-conversation model / effort ───────────────────────────────────────

  /** Get the per-conversation model override (null = inherit global). */
  @Get(':id/model')
  getModel(@Param('id') id: string): { model: string | null } {
    return { model: this.convManager.getConversationModel(id) };
  }

  /** Set the per-conversation model override. Empty string clears it. */
  @Put(':id/model')
  setModel(
    @Param('id') id: string,
    @Body() body: { model: string },
  ): { ok: boolean } {
    return { ok: this.convManager.setConversationModel(id, body.model ?? '') };
  }

  /** Get the per-conversation effort override (null = inherit global). */
  @Get(':id/effort')
  getEffort(@Param('id') id: string): { effort: string | null } {
    return { effort: this.convManager.getConversationEffort(id) };
  }

  /** Set the per-conversation effort override. Empty string clears it. */
  @Put(':id/effort')
  setEffort(
    @Param('id') id: string,
    @Body() body: { effort: string },
  ): { ok: boolean } {
    return { ok: this.convManager.setConversationEffort(id, body.effort ?? '') };
  }

  // ── Claude native session import ──────────────────────────────────────────

  /**
   * Get the Claude native session ID bound to this conversation.
   * Returns null when no marker exists (next turn will start a fresh session).
   */
  @Get(':id/claude-session')
  getClaudeSession(@Param('id') id: string): { sessionId: string | null } {
    return { sessionId: this.convManager.getClaudeSessionMarker(id) };
  }

  /**
   * Set / import a Claude native session ID.
   * The session ID is the UUID emitted by `claude` as `session_id`.
   */
  @Put(':id/claude-session')
  setClaudeSession(
    @Param('id') id: string,
    @Body() body: { sessionId: string },
  ): { ok: boolean } {
    return { ok: this.convManager.setClaudeSessionMarker(id, body.sessionId) };
  }

  /** Clear the session marker so the next agent turn starts a fresh session. */
  @Delete(':id/claude-session')
  clearClaudeSession(@Param('id') id: string): { ok: boolean } {
    return { ok: this.convManager.setClaudeSessionMarker(id, null) };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Resolve a ConversationBundle by id, throwing 404 when unknown. */
  private requireBundle(id: string): ConversationBundle {
    const bundle = id === DEFAULT_CONVERSATION_ID
      ? this.convManager.getOrCreate(id)
      : this.convManager.get(id);
    if (!bundle) throw new NotFoundException('Conversation not found');
    return bundle;
  }
}
