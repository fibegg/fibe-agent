import { Subject } from 'rxjs';
import type { TokenUsage } from '../activity-store/activity-store.service';
import type { OutboundEvent } from './orchestrator.service';
import type { AgentStrategy } from '../strategies/strategy.types';

export type BusyPolicy = 'reject' | 'queue' | 'steer';

export interface QueuedAgentTurn {
  id: string;
  messageId: string;
  text: string;
  displayText?: string;
  imageUrls: string[];
  audioFilename: string | null;
  attachmentFilenames?: string[];
  policy: Exclude<BusyPolicy, 'reject'>;
  createdAt: string;
}

/**
 * Mutable state for one WebSocket session. Messages, activity, model, and effort
 * remain conversation-scoped; provider processes and outbound events stay session-scoped.
 */
export class SessionContext {
  readonly sessionId: string;

  isAuthenticated = false;

  isProcessing = false;

  /** Last provider/runtime error observed for this session. Exposed via status for diagnostics. */
  lastError: string | null = null;

  isClientConnected = true;

  /** Set when the browser disconnects while the agent is still running. */
  destroyWhenIdle = false;

  /**
   * Per-session event stream. The WS layer subscribes to this so each client
   * only receives events for its own session.
   *
   * Shared-state events (auth broadcast, model/effort changes) are forwarded
   * to all sessions by the SessionRegistry.
   */
  readonly outbound$ = new Subject<OutboundEvent>();

  readonly strategy: AgentStrategy;

  currentActivityId: string | null = null;
  reasoningTextAccumulated = '';
  streamTextAccumulated = '';
  streamStartedAt: string | null = null;
  lastStreamText = '';
  lastStreamStartedAt: string | null = null;
  lastStreamFinishedAt: string | null = null;
  lastStreamUsage: TokenUsage | undefined = undefined;

  /** User turns accepted while this conversation is already processing. */
  queuedTurns: QueuedAgentTurn[] = [];

  /** True while an in-flight turn is being deliberately interrupted for steer/restart. */
  pendingSteerRestart = false;

  /** Cached system-prompt file contents (same for all sessions, but cheaply replicated). */
  cachedSystemPromptFromFile: string | null = null;

  /** The conversation this session is bound to. Defaults to 'default' (legacy). */
  conversationId: string;

  constructor(
    sessionId: string,
    strategy: AgentStrategy,
    conversationId = 'default',
  ) {
    this.sessionId = sessionId;
    this.strategy = strategy;
    this.conversationId = conversationId;
  }

  /** Emit an outbound event to this session's subscriber (the WS client). */
  send(type: string, data: Record<string, unknown> = {}): void {
    this.outbound$.next({ type, data });
  }

  /** Tear down the session: complete the outbound stream and interrupt any in-flight agent. */
  destroy(): void {
    try {
      this.strategy.interruptAgent?.();
    } catch {
      // best-effort
    }
    this.outbound$.complete();
  }
}
