import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SessionContext } from './session-context';
import type { OutboundEvent } from './orchestrator.service';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import { WS_EVENT } from '@shared/ws-constants';
import { ConversationManagerService } from '../conversation/conversation-manager.service';

export interface ConversationLiveState {
  conversationId: string;
  isProcessing: boolean;
  streamText: string;
  currentActivityId: string | null;
  queuedTurns: number;
  queue: {
    id?: string;
    messageId?: string;
    text: string;
    policy: 'queue' | 'steer';
    attachmentFilenames?: string[];
    createdAt?: string;
  }[];
  startedAt: string | null;
  finishedAt: string | null;
}

const RECENT_STREAM_RETENTION_MS = 30_000;

/**
 * Manages the lifecycle of per-connection SessionContexts.
 *
 * - `create()` is called when a new WS client connects.
 * - `destroy()` is called when the client disconnects.
 * - `broadcast()` pushes an event to ALL live sessions (used for shared-state changes
 *   like model/effort updates, auth status, conversation resets).
 * - `broadcastProcessingState()` pushes anyProcessing flag + session count to all.
 *
 * Performance notes:
 * - `byConversation` maintains a per-conversation Set for O(k) broadcasts, where k
 *   is the number of sessions in that conversation (vs O(n) total sessions).
 * - `_allCache` caches the full sessions array and is invalidated on create/destroy.
 */
@Injectable()
export class SessionRegistryService {
  private readonly logger = new Logger(SessionRegistryService.name);
  private readonly sessions = new Map<string, SessionContext>();
  /** Per-conversation session sets for O(k) broadcastToConversation. */
  private readonly byConversation = new Map<string, Set<SessionContext>>();
  /** Cached result of `all()` — invalidated on create/destroy. */
  private _allCache: SessionContext[] | null = null;

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
    const detached = this.sessionsForConversation(conversationId)
      .find((s) => !s.isClientConnected && s.isProcessing);
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
    this.addToConversationIndex(ctx);
    this._allCache = null;
    this.logger.log(`Session created: ${sessionId} conversation:${conversationId} (total: ${this.sessions.size})`);
    this.broadcastSessionCount();
    return ctx;
  }

  /** Look up a session by ID. */
  get(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  /** All active sessions (cached — O(1) on repeat calls between mutations). */
  all(): SessionContext[] {
    if (!this._allCache) {
      this._allCache = [...this.sessions.values()];
    }
    return this._allCache;
  }

  /** Sessions that still have a browser WebSocket attached. */
  connected(): SessionContext[] {
    return this.all().filter((s) => s.isClientConnected);
  }

  processingForConversation(conversationId: string): SessionContext | undefined {
    const inIndex = this.sessionsForConversation(conversationId);
    // If the index has entries, use it (fast path O(k))
    if (inIndex.length > 0) return inIndex.find((s) => s.isProcessing);
    // Fallback: scan all sessions for the conversationId (handles runtime mutations)
    return this.all().find(
      (s) => s.conversationId === conversationId && s.isProcessing,
    );
  }

  isConversationProcessing(conversationId: string, excludeSessionId?: string): boolean {
    const inIndex = this.sessionsForConversation(conversationId);
    if (inIndex.length > 0) {
      return inIndex.some(
        (s) => s.sessionId !== excludeSessionId && s.isProcessing,
      );
    }
    return this.all().some(
      (s) =>
        s.conversationId === conversationId &&
        s.sessionId !== excludeSessionId &&
        s.isProcessing,
    );
  }

  liveConversationState(conversationId: string): ConversationLiveState {
    const processing = this.processingForConversation(conversationId);
    if (processing) {
      return {
        conversationId,
        isProcessing: true,
        streamText: processing.streamTextAccumulated,
        currentActivityId: processing.currentActivityId,
        queuedTurns: processing.queuedTurns.length,
        queue: processing.queuedTurns.map((turn) => ({
          id: turn.id,
          messageId: turn.messageId,
          text: turn.displayText ?? turn.text,
          policy: turn.policy,
          createdAt: turn.createdAt,
          ...(turn.attachmentFilenames?.length ? { attachmentFilenames: turn.attachmentFilenames } : {}),
        })),
        startedAt: processing.streamStartedAt,
        finishedAt: null,
      };
    }
    const completed = this.recentCompletedStreamForConversation(conversationId);
    return {
      conversationId,
      isProcessing: false,
      streamText: completed?.lastStreamText ?? '',
      currentActivityId: null,
      queuedTurns: completed?.queuedTurns.length ?? 0,
      queue: completed?.queuedTurns.map((turn) => ({
        id: turn.id,
        messageId: turn.messageId,
        text: turn.displayText ?? turn.text,
        policy: turn.policy,
        createdAt: turn.createdAt,
        ...(turn.attachmentFilenames?.length ? { attachmentFilenames: turn.attachmentFilenames } : {}),
      })) ?? [],
      startedAt: completed?.lastStreamStartedAt ?? null,
      finishedAt: completed?.lastStreamFinishedAt ?? null,
    };
  }

  private recentCompletedStreamForConversation(conversationId: string): SessionContext | undefined {
    const cutoff = Date.now() - RECENT_STREAM_RETENTION_MS;
    return this.sessionsForConversation(conversationId)
      .filter((s) => {
        if (!s.lastStreamText || !s.lastStreamFinishedAt) return false;
        const finishedAt = Date.parse(s.lastStreamFinishedAt);
        return !Number.isNaN(finishedAt) && finishedAt >= cutoff;
      })
      .sort((a, b) => Date.parse(b.lastStreamFinishedAt ?? '') - Date.parse(a.lastStreamFinishedAt ?? ''))[0];
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
    this.removeFromConversationIndex(ctx);
    this._allCache = null;
    this.logger.log(`Session destroyed: ${sessionId} (total: ${this.sessions.size})`);
    this.broadcastSessionCount();
  }

  destroyConversation(conversationId: string): void {
    for (const ctx of this.sessionsForConversation(conversationId)) {
      this.destroy(ctx.sessionId);
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
   * O(k) where k = sessions in that conversation — uses per-conversation index.
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
    const set = this.byConversation.get(conversationId);
    if (!set) return;
    for (const ctx of set) {
      ctx.outbound$.next(event);
    }
  }

  /**
   * Push auth_status to every session with the current anyProcessing flag.
   * Called when any session's isProcessing changes so all UIs stay in sync.
   * Single pass: compute anyProcessing once, then iterate once.
   */
  broadcastAuthStatus(
    status: string,
    extraData: Record<string, unknown> = {}
  ): void {
    const sessions = this.all();
    const anyProcessing = sessions.some((s) => s.isProcessing);
    for (const s of sessions) {
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

  /** Returns sessions for a conversation as an array for iteration. */
  private sessionsForConversation(conversationId: string): SessionContext[] {
    const set = this.byConversation.get(conversationId);
    return set ? [...set] : [];
  }

  private addToConversationIndex(ctx: SessionContext): void {
    let set = this.byConversation.get(ctx.conversationId);
    if (!set) {
      set = new Set();
      this.byConversation.set(ctx.conversationId, set);
    }
    set.add(ctx);
  }

  private removeFromConversationIndex(ctx: SessionContext): void {
    const set = this.byConversation.get(ctx.conversationId);
    if (!set) return;
    set.delete(ctx);
    if (set.size === 0) {
      this.byConversation.delete(ctx.conversationId);
    }
  }
}
