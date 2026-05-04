import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
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

  // ── Per-conversation model / effort ───────────────────────────────────────

  /** Get the per-conversation model override (null = inherit global). */
  @Get(':id/model')
  getModel(@Param('id') id: string): { model: string | null } {
    return { model: this.convManager.getConversationModel(id) };
  }

  /** Set the per-conversation model override. Send empty string to clear. */
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

  /** Set the per-conversation effort override. Send empty string to clear. */
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
   * Returns null when no session marker exists (next turn will start fresh).
   */
  @Get(':id/claude-session')
  getClaudeSession(@Param('id') id: string): { sessionId: string | null } {
    return { sessionId: this.convManager.getClaudeSessionMarker(id) };
  }

  /**
   * Import / override the Claude native session ID for this conversation.
   * Useful when the user wants to resume an existing Claude CLI session.
   * The session ID is the UUID emitted by `claude` as `session_id`.
   */
  @Put(':id/claude-session')
  setClaudeSession(
    @Param('id') id: string,
    @Body() body: { sessionId: string },
  ): { ok: boolean } {
    return { ok: this.convManager.setClaudeSessionMarker(id, body.sessionId) };
  }

  /**
   * Clear the Claude session marker so the next agent turn starts a new session.
   * The previous session remains in Claude's storage and can be re-imported later.
   */
  @Delete(':id/claude-session')
  clearClaudeSession(@Param('id') id: string): { ok: boolean } {
    return { ok: this.convManager.setClaudeSessionMarker(id, null) };
  }
}

