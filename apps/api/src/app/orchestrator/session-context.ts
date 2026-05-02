import { Subject } from 'rxjs';
import type { TokenUsage } from '../activity-store/activity-store.service';
import type { OutboundEvent } from './orchestrator.service';
import type { AgentStrategy } from '../strategies/strategy.types';

/**
 * Holds all mutable state that is scoped to a single WebSocket connection / chat session.
 *
 * The OrchestratorService (singleton) owns shared infra (stores, strategy factory, etc.).
 * Each connected client gets its own SessionContext so sessions are completely isolated:
 * every tab / device can run its own Claude process without interfering with others.
 *
 * Shared across sessions (intentionally): messages.json, activity.json, model, effort.
 * This gives a "shared chat-room" UX — all participants see the same conversation thread.
 */
export class SessionContext {
  /** Unique ID generated when the WS client connects. */
  readonly sessionId: string;

  /** Whether this session's Claude credentials have been verified. */
  isAuthenticated = false;

  /** Whether this session's agent is currently running a prompt. */
  isProcessing = false;

  /**
   * Per-session event stream. The WS layer subscribes to this so each client
   * only receives events for its own session.
   *
   * Shared-state events (auth broadcast, model/effort changes) are forwarded
   * to all sessions by the SessionRegistry.
   */
  readonly outbound$ = new Subject<OutboundEvent>();

  /** Claude process / strategy instance owned by this session. */
  readonly strategy: AgentStrategy;

  // ── Streaming scratch-pad ──────────────────────────────────────────────────
  currentActivityId: string | null = null;
  reasoningTextAccumulated = '';
  lastStreamUsage: TokenUsage | undefined = undefined;

  /** Cached system-prompt file contents (same for all sessions, but cheaply replicated). */
  cachedSystemPromptFromFile: string | null = null;

  /** MCP tool list cache — fetched once per session at startup. */
  mcpToolsCache: Array<{ name: string; description: string }> | null = null;

  constructor(sessionId: string, strategy: AgentStrategy) {
    this.sessionId = sessionId;
    this.strategy = strategy;
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
