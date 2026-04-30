import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ChildProcess, fork } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Subject } from 'rxjs';

import {
  DEFAULT_ASK_TIMEOUT_MS,
  LOCAL_TOOL,
  type LocalToolCallRequest,
  type LocalToolCallResponse,
  type LocalToolName,
} from './local-mcp-types';
import {
  AGENT_MODE_KEYS,
  resolveAgentMode,
} from '@shared/agent-mode.constants';
import { WS_EVENT } from '@shared/ws-constants';

export interface OutboundEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Spawns the stdio MCP child process and handles all local tool calls forwarded
 * from it via POST /api/local-tool-call.
 *
 * Interactive tools (ask_user, confirm_action) block until the operator replies
 * via WebSocket, or until the configured timeout expires.
 */
@Injectable()
export class LocalMcpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocalMcpService.name);

  /** WS events forwarded to the chat UI by OrchestratorService. */
  readonly outbound$ = new Subject<OutboundEvent>();

  /** Pending interactive tool promises keyed by questionId. */
  private readonly pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  /** Injected by OrchestratorService after init. */
  private modeGetter: (() => string) | null = null;
  private modeSetter: ((mode: string) => string | null) | null = null;

  private child: ChildProcess | null = null;
  private readonly askTimeoutMs: number;

  constructor() {
    this.askTimeoutMs =
      parseInt(process.env['ASK_USER_TIMEOUT_MS'] ?? '0', 10) ||
      DEFAULT_ASK_TIMEOUT_MS;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  onModuleInit(): void {
    this.spawnServer();
  }

  onModuleDestroy(): void {
    this.cleanup();
  }

  // ─── Mode injection ─────────────────────────────────────────────────────────

  registerModeAccessors(
    getter: () => string,
    setter: (mode: string) => string | null,
  ): void {
    this.modeGetter = getter;
    this.modeSetter = setter;
  }

  // ─── Child process ──────────────────────────────────────────────────────────

  private spawnServer(): void {
    const serverPath = this.getServerScriptPath();
    try {
      this.child = fork(serverPath, [], {
        env: { ...process.env, PORT: process.env['PORT'] ?? '3000' },
        stdio: 'pipe',
        silent: true,
      });
      this.child.on('error', (err) =>
        this.logger.error(`Local MCP server error: ${err.message}`),
      );
      this.child.on('exit', (code, signal) => {
        this.logger.warn(`Local MCP server exited (code=${code}, signal=${signal})`);
        this.child = null;
      });
      this.child.stdout?.on('data', () => { /* consumed by MCP client */ });
      this.child.stderr?.on('data', (d: Buffer) => {
        const msg = d.toString().trim();
        if (msg) this.logger.debug(`[local-mcp] ${msg}`);
      });
      this.logger.log(`Local MCP server spawned (PID ${this.child.pid ?? '?'})`);
    } catch (err) {
      this.logger.error(
        `Failed to spawn local MCP server: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private cleanup(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('Server shutting down'));
    }
    this.pending.clear();
    this.child?.kill();
    this.child = null;
  }

  // ─── Tool call entry point ──────────────────────────────────────────────────

  async handleToolCall(req: LocalToolCallRequest): Promise<LocalToolCallResponse> {
    const { requestId, tool, args } = req;
    try {
      const result = await this.dispatch(tool as LocalToolName, args);
      return { requestId, ok: true, result };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Local tool '${tool}' failed: ${error}`);
      return { requestId, ok: false, error };
    }
  }

  private async dispatch(
    tool: LocalToolName,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const str = (key: string) =>
      args[key] !== undefined ? String(args[key]) : undefined;

    switch (tool) {
      case LOCAL_TOOL.ASK_USER:
        return this.askUser(str('question') ?? '', str('placeholder'));

      case LOCAL_TOOL.CONFIRM_ACTION:
        return this.confirmAction(
          str('message') ?? '',
          str('confirmLabel'),
          str('cancelLabel'),
        );

      case LOCAL_TOOL.SHOW_IMAGE:
        return this.showImage(str('url'), str('base64'), str('mimeType'), str('caption'));

      case LOCAL_TOOL.NOTIFY:
        return this.emit(WS_EVENT.NOTIFY, { message: str('message') ?? '', level: str('level') ?? 'info' });

      case LOCAL_TOOL.SET_TITLE:
        return this.emit(WS_EVENT.SET_TITLE, { title: str('title') ?? '' });

      case LOCAL_TOOL.GET_MODE:
        return { mode: this.modeGetter ? this.modeGetter() : 'Exploring...' };

      case LOCAL_TOOL.SET_MODE: {
        const raw = str('mode') ?? '';
        if (!AGENT_MODE_KEYS.includes(raw as never)) {
          throw new Error(`Invalid mode "${raw}". Valid values: ${AGENT_MODE_KEYS.join(', ')}`);
        }
        const resolved = this.modeSetter ? this.modeSetter(raw) : resolveAgentMode(raw);
        if (!resolved) throw new Error(`Failed to resolve mode "${raw}"`);
        return { ok: true, mode: resolved };
      }

      default:
        throw new Error(`Unknown local tool: ${String(tool)}`);
    }
  }

  // ─── Tool handlers ──────────────────────────────────────────────────────────

  private askUser(question: string, placeholder?: string): Promise<{ answer: string }> {
    if (!question.trim()) {
      return Promise.reject(new Error('ask_user: question must not be empty'));
    }
    const questionId = randomUUID();
    this.outbound$.next({
      type: WS_EVENT.ASK_USER_PROMPT,
      data: { questionId, question, placeholder: placeholder ?? '' },
    });
    return this.waitForReply<{ answer: string }>(questionId);
  }

  private confirmAction(
    message: string,
    confirmLabel?: string,
    cancelLabel?: string,
  ): Promise<{ confirmed: boolean }> {
    if (!message.trim()) {
      return Promise.reject(new Error('confirm_action: message must not be empty'));
    }
    const questionId = randomUUID();
    this.outbound$.next({
      type: WS_EVENT.CONFIRM_ACTION_PROMPT,
      data: {
        questionId,
        message,
        confirmLabel: confirmLabel ?? 'Yes',
        cancelLabel: cancelLabel ?? 'No',
      },
    });
    return this.waitForReply<{ confirmed: boolean }>(questionId);
  }

  private showImage(
    url?: string,
    base64?: string,
    mimeType?: string,
    caption?: string,
  ): Promise<{ ok: true }> {
    if (!url && !base64) {
      return Promise.reject(new Error('show_image: either url or base64 must be provided'));
    }
    return this.emit(WS_EVENT.SHOW_IMAGE, {
      url: url ?? null,
      base64: base64 ?? null,
      mimeType: mimeType ?? 'image/png',
      caption: caption ?? '',
    });
  }

  /** Fire-and-forget: emit an event and immediately resolve { ok: true }. */
  private emit(type: string, data: Record<string, unknown>): Promise<{ ok: true }> {
    this.outbound$.next({ type, data });
    return Promise.resolve({ ok: true });
  }

  // ─── Blocking reply helpers ─────────────────────────────────────────────────

  private waitForReply<T>(questionId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(questionId);
        reject(new Error(`Timed out waiting for operator reply (questionId=${questionId})`));
      }, this.askTimeoutMs);
      this.pending.set(questionId, { resolve: resolve as (v: unknown) => void, reject, timer });
    });
  }

  /**
   * Resolves a pending ask_user / confirm_action promise.
   * Called by OrchestratorService when the operator replies via WebSocket.
   */
  resolveQuestion(questionId: string, payload: unknown): void {
    const p = this.pending.get(questionId);
    if (!p) {
      this.logger.warn(`No pending question with id=${questionId}`);
      return;
    }
    clearTimeout(p.timer);
    this.pending.delete(questionId);
    p.resolve(payload);
  }

  /** Path to the compiled stdio server script (used by OrchestratorService). */
  getServerScriptPath(): string {
    return join(__dirname, 'local-mcp.server.js');
  }
}
