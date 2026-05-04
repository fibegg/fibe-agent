import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SessionContext } from './session-context';
import type { OutboundEvent } from './orchestrator.service';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import { WS_EVENT } from '@shared/ws-constants';
import { ConversationManagerService } from '../conversation/conversation-manager.service';

/**
 * Manages the lifecycle of per-connection SessionContexts.
 *
 * - `create()` is called when a new WS client connects.
 * - `destroy()` is called when the client disconnects.
 * - `broadcast()` pushes an event to ALL live sessions (used for shared-state changes
 *   like model/effort updates, auth status, conversation resets).
 * - `broadcastProcessingState()` pushes anyProcessing flag + session count to all.
 */
@Injectable()
export class SessionRegistryService {
  private readonly logger = new Logger(SessionRegistryService.name);
  private readonly sessions = new Map<string, SessionContext>();

  constructor(
    private readonly strategyRegistry: StrategyRegistryService,
    private readonly conversationManager: ConversationManagerService,
  ) {}

  /**
   * Create a new isolated session context for an incoming WS connection.
   * Each session gets its own AgentStrategy instance (= its own Claude process slot).
   * Pass conversationId to bind this session to a specific conversation thread.
   */
  create(conversationId = 'default', clientConnected = true): SessionContext {
    const detached = [...this.sessions.values()].find(
      (s) => s.conversationId === conversationId && !s.isClientConnected && s.isProcessing,
    );
    if (detached) {
      detached.isClientConnected = true;
      detached.destroyWhenIdle = false;
      this.logger.log(`Session reattached: ${detached.sessionId} conversation:${conversationId}`);
      this.broadcastSessionCount();
      return detached;
    }

    const sessionId = randomUUID();
    const strategy = this.strategyRegistry.resolveStrategy(
      this.conversationManager.dataDirProvider(conversationId),
    );
    const ctx = new SessionContext(sessionId, strategy, conversationId);
    ctx.isClientConnected = clientConnected;
    this.sessions.set(sessionId, ctx);
    this.logger.log(`Session created: ${sessionId} conversation:${conversationId} (total: ${this.sessions.size})`);
    this.broadcastSessionCount();
    return ctx;
  }

  /** Look up a session by ID. */
  get(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  /** All active sessions. */
  all(): SessionContext[] {
    return [...this.sessions.values()];
  }

  /** Sessions that still have a browser WebSocket attached. */
  connected(): SessionContext[] {
    return this.all().filter((s) => s.isClientConnected);
  }

  processingForConversation(conversationId: string): SessionContext | undefined {
    return [...this.sessions.values()].find(
      (s) => s.conversationId === conversationId && s.isProcessing,
    );
  }

  isConversationProcessing(conversationId: string, excludeSessionId?: string): boolean {
    return [...this.sessions.values()].some(
      (s) =>
        s.conversationId === conversationId &&
        s.sessionId !== excludeSessionId &&
        s.isProcessing,
    );
  }

  get size(): number {
    return this.connected().length;
  }

  /**
   * Tear down a session: interrupt its agent, complete its stream, remove from registry.
   */
  destroy(sessionId: string): void {
    const ctx = this.sessions.get(sessionId);
    if (!ctx) return;
    ctx.destroy();
    this.sessions.delete(sessionId);
    this.logger.log(`Session destroyed: ${sessionId} (total: ${this.sessions.size})`);
    this.broadcastSessionCount();
  }

  destroyConversation(conversationId: string): void {
    for (const ctx of [...this.sessions.values()]) {
      if (ctx.conversationId === conversationId) {
        this.destroy(ctx.sessionId);
      }
    }
  }

  /**
   * Browser disconnected. If the agent is running, keep the runtime session in
   * the registry so the provider turn can finish and the same conversation
   * remains locked. It is removed by destroyIfDetachedAndIdle() once complete.
   */
  detach(sessionId: string): void {
    const ctx = this.sessions.get(sessionId);
    if (!ctx) return;
    ctx.isClientConnected = false;
    if (ctx.isProcessing) {
      ctx.destroyWhenIdle = true;
      this.logger.log(`Session detached while processing: ${sessionId}`);
      this.broadcastSessionCount();
      return;
    }
    this.destroy(sessionId);
  }

  destroyIfDetachedAndIdle(sessionId: string): void {
    const ctx = this.sessions.get(sessionId);
    if (!ctx || ctx.isClientConnected || ctx.isProcessing || !ctx.destroyWhenIdle) return;
    this.destroy(sessionId);
  }

  /**
   * Push an event to every active session.
   * Used for shared-state changes: auth, model/effort updates, conversation reset, etc.
   */
  broadcast(type: string, data: Record<string, unknown> = {}): void {
    const event: OutboundEvent = { type, data };
    for (const ctx of this.sessions.values()) {
      ctx.outbound$.next(event);
    }
  }

  /**
   * Push an event only to sessions bound to a given conversation.
   * This keeps live chat and activity updates isolated across threads.
   */
  broadcastToConversation(
    conversationId: string,
    type: string,
    data: Record<string, unknown> = {},
  ): void {
    const event: OutboundEvent = {
      type,
      data: { conversationId, ...data },
    };
    for (const ctx of this.sessions.values()) {
      if (ctx.conversationId === conversationId) {
        ctx.outbound$.next(event);
      }
    }
  }

  /**
   * Push auth_status to every session with the current anyProcessing flag.
   * Called when any session's isProcessing changes so all UIs stay in sync.
   */
  broadcastAuthStatus(
    status: string,
    extraData: Record<string, unknown> = {}
  ): void {
    const anyProcessing = [...this.sessions.values()].some((s) => s.isProcessing);
    for (const s of this.sessions.values()) {
      const isProcessing =
        s.isProcessing || this.isConversationProcessing(s.conversationId, s.sessionId);
      s.send('auth_status', { status, isProcessing, anyProcessing, ...extraData });
    }
  }

  /**
   * Send the current session count to all connected clients.
   * Each client can display "N tabs open" or similar.
   */
  private broadcastSessionCount(): void {
    this.broadcast(WS_EVENT.SESSIONS_UPDATED, { count: this.size });
  }
}
