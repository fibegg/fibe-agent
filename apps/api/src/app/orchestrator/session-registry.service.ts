import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SessionContext } from './session-context';
import type { OutboundEvent } from './orchestrator.service';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';

/**
 * Manages the lifecycle of per-connection SessionContexts.
 *
 * - `create()` is called when a new WS client connects.
 * - `destroy()` is called when the client disconnects.
 * - `broadcast()` pushes an event to ALL live sessions (used for shared-state changes
 *   like model/effort updates, auth status, conversation resets).
 */
@Injectable()
export class SessionRegistryService {
  private readonly logger = new Logger(SessionRegistryService.name);
  private readonly sessions = new Map<string, SessionContext>();

  constructor(private readonly strategyRegistry: StrategyRegistryService) {}

  /**
   * Create a new isolated session context for an incoming WS connection.
   * Each session gets its own AgentStrategy instance (= its own Claude process slot).
   */
  create(): SessionContext {
    const sessionId = randomUUID();
    const strategy = this.strategyRegistry.resolveStrategy();
    const ctx = new SessionContext(sessionId, strategy);
    this.sessions.set(sessionId, ctx);
    this.logger.log(`Session created: ${sessionId} (total: ${this.sessions.size})`);
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

  get size(): number {
    return this.sessions.size;
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
}
