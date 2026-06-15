import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isProviderAuthFailureMessage } from '@shared/provider-auth-errors';
import { ConfigService } from '../config/config.service';
import { ActivityStoreService } from '../activity-store/activity-store.service';
import {
  MessageStoreService,
  type StoredStoryEntry,
} from '../message-store/message-store.service';
import { FibeSyncService } from '../fibe-sync/fibe-sync.service';
import { ModelStoreService } from '../model-store/model-store.service';
import { EffortStoreService } from '../effort-store/effort-store.service';
import { AgentModeStoreService } from '../agent-mode/agent-mode.store.service';
import { createAgentModeTriggerStream } from '../agent-mode/agent-mode-trigger-stream';
import { UploadsService } from '../uploads/uploads.service';
import type {
  AuthConnection,
  LogoutConnection,
  ThinkingStep,
  TokenUsage,
} from '../strategies/strategy.types';
import { INTERRUPTED_MESSAGE } from '../strategies/strategy.types';
import {
  AUTH_STATUS as AUTH_STATUS_VAL,
  ERROR_CODE,
  WS_ACTION,
  WS_EVENT,
} from '@shared/ws-constants';
import type { AgentModeValue } from '@shared/agent-mode.constants';

import { writeMcpConfig } from '../config/mcp-config-writer';

import { ChatPromptContextService } from './chat-prompt-context.service';
import {
  finishAgentStream,
  type FinishAgentStreamDeps,
} from './finish-agent-stream';
import { createStreamingCallbacks } from './orchestrator-streaming-callbacks';
import { GemmaRouterService } from '../gemma-router/gemma-router.service';
import { GemmaMcpToolsService } from '../gemma-router/gemma-mcp-tools.service';
import { LocalMcpService } from '../local-mcp/local-mcp.service';
import {
  SessionContext,
  type BusyPolicy,
  type QueuedAgentTurn,
} from './session-context';
import { SessionRegistryService } from './session-registry.service';
import {
  ConversationManagerService,
  INBOX_CONVERSATION_ID,
} from '../conversation/conversation-manager.service';

export interface OutboundEvent {
  type: string;
  data: Record<string, unknown>;
}

type AgentControlAction = 'interrupt' | 'queue' | 'steer';

interface AgentControlResult {
  accepted: boolean;
  action: AgentControlAction;
  conversationId?: string;
  interrupted?: boolean;
  messageId?: string;
  resolvedPolicy?: string;
  queueCount?: number;
  error?: string;
  reason?: string;
}

type ControlTargetResolution =
  | { accepted: true; ctx: SessionContext }
  | { accepted: false; result: AgentControlResult };

@Injectable()
export class OrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(OrchestratorService.name);
  /** Shared auth state — if provider is authed, all sessions benefit. */
  private sharedIsAuthenticated = false;
  /** Cached system prompt shared across all sessions. */
  private sharedSystemPromptFromFile: string | null = null;

  constructor(
    private readonly activityStore: ActivityStoreService,
    private readonly messageStore: MessageStoreService,
    private readonly modelStore: ModelStoreService,
    private readonly effortStore: EffortStoreService,
    private readonly config: ConfigService,
    private readonly sessionRegistry: SessionRegistryService,
    private readonly uploadsService: UploadsService,
    private readonly fibeSync: FibeSyncService,
    private readonly chatPromptContext: ChatPromptContextService,
    private readonly gemmaRouter: GemmaRouterService,
    private readonly gemmaMcpTools: GemmaMcpToolsService,
    private readonly agentModeStore: AgentModeStoreService,
    private readonly localMcp: LocalMcpService,
    private readonly conversationManager: ConversationManagerService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Build the fibe-local entry here, where we already hold a reference to the
    // LocalMcpService and can use __dirname-based resolution without touching webpack.
    const localServer = this.localMcp.getServerLaunch();
    writeMcpConfig({
      'fibe-local': {
        command: localServer.command,
        args: localServer.args,
        env: {
          ...localServer.env,
        },
      },
    });
    if (!this.config.getSystemPrompt()) {
      const builtinPath = join(
        process.cwd(),
        'dist',
        'assets',
        'SYSTEM_PROMPT.md',
      );
      if (existsSync(builtinPath)) {
        try {
          this.sharedSystemPromptFromFile = await readFile(builtinPath, 'utf8');
        } catch {
          this.logger.warn('Failed to read built-in system prompt file');
        }
      }
    }

    // Forward local MCP tool WS events (ask_user_prompt, confirm_action_prompt, etc.) to the chat UI
    this.localMcp.outbound$.subscribe((event) => {
      const data = event.data as Record<string, unknown>;
      const conversationId =
        typeof data.conversationId === 'string' ? data.conversationId : null;
      if (conversationId) {
        this.sessionRegistry.broadcastToConversation(
          conversationId,
          event.type,
          data,
        );
      } else {
        this.sessionRegistry.broadcast(event.type, data);
      }
    });

    // Register mode accessors so local tools can read/write the agent mode
    this.localMcp.registerModeAccessors(
      () => this.agentModeStore.get(),
      (mode) => this.setAgentMode(mode),
    );

    // Pre-fetch optional HTTP MCP tool descriptions for Gemma classification (non-blocking).
    // Claude and other agent clients discover stdio MCP tools themselves.
    if (this.config.isGemmaRouterEnabled()) {
      void this.gemmaMcpTools.refresh();
    }

    if (this.config.isFibeHydrateEnabled()) {
      try {
        const messagesContent = await this.fibeSync.hydrate('messages');
        if (messagesContent) {
          try {
            const parsed = JSON.parse(messagesContent);
            this.messageStore.hydrate(parsed);
          } catch (e) {
            this.logger.warn(`Failed to parse hydrated messages: ${e}`);
          }
        }

        const activityContent = await this.fibeSync.hydrate('activity');
        if (activityContent) {
          try {
            const parsed = JSON.parse(activityContent);
            this.activityStore.hydrate(parsed);
          } catch (e) {
            this.logger.warn(`Failed to parse hydrated activity: ${e}`);
          }
        }
      } catch (err) {
        this.logger.error(`Error during hydration: ${err}`);
      }
    }
  }

  /** Backward-compat: shared authentication flag for REST endpoint */
  get isAuthenticated(): boolean {
    return this.sharedIsAuthenticated;
  }
  set isAuthenticated(v: boolean) {
    this.sharedIsAuthenticated = v;
  }
  /** Backward-compat: true if ANY session is processing */
  get isProcessing(): boolean {
    return this.sessionRegistry.all().some((s) => s.isProcessing);
  }
  get queueCount(): number {
    return this.sessionRegistry
      .all()
      .reduce((sum, s) => sum + s.queuedTurns.length, 0);
  }
  get lastError(): string | null {
    const latest = this.sessionRegistry
      .all()
      .find(
        (s) => typeof s.lastError === 'string' && s.lastError.trim() !== '',
      );
    return latest?.lastError ?? null;
  }
  /** Backward-compat: default conversation message store (used by REST /messages endpoint). */
  get messages(): MessageStoreService {
    return this.messageStore;
  }
  ensureStrategySettings(): void {
    /* no-op in multi-session mode */
  }

  /**
   * Returns per-conversation MessageStore + ActivityStore for the given session.
   * Falls back to the legacy singleton stores for the 'default' conversation so
   * existing single-conversation installs are unaffected.
   */
  private stores(ctx: SessionContext): {
    messageStore: MessageStoreService;
    activityStore: ActivityStoreService;
  } {
    const { messageStore, activityStore } =
      this.conversationManager.getOrCreate(ctx.conversationId);
    return { messageStore, activityStore };
  }

  private finishStreamDeps(ctx: SessionContext): FinishAgentStreamDeps {
    const { messageStore: fMsg, activityStore: fAct } = this.stores(ctx);
    // Fan-out stream-completion events to all tabs watching this conversation.
    const bcast = (type: string, data?: Record<string, unknown>) =>
      this.sessionRegistry.broadcastToConversation(
        ctx.conversationId,
        type,
        data ?? {},
      );
    return {
      messageStore: fMsg,
      modelStore: this.modelStore,
      activityStore: fAct,
      fibeSync: this.fibeSync,
      send: bcast,
      getCurrentActivityId: () => ctx.currentActivityId,
      clearLastStreamUsage: () => {
        ctx.lastStreamUsage = undefined;
      },
      clearReasoningText: () => {
        ctx.reasoningTextAccumulated = '';
      },
      conversationId: ctx.conversationId,
    };
  }

  private async flushStores(ctx?: SessionContext): Promise<void> {
    const convStores = ctx ? this.stores(ctx) : null;
    await Promise.all([
      convStores ? convStores.messageStore.flush() : this.messageStore.flush(),
      convStores
        ? convStores.activityStore.flush()
        : this.activityStore.flush(),
      this.modelStore.flush(),
      this.effortStore.flush(),
    ]);
  }

  /**
   * Validate, persist, and broadcast a new agent mode.
   * Returns the resolved display string, or `null` when the mode is invalid.
   */
  setAgentMode(mode: string): AgentModeValue | null {
    const resolved = this.agentModeStore.set(mode);
    if (!resolved) return null;
    this.sessionRegistry.broadcast(WS_EVENT.AGENT_MODE_UPDATED, {
      mode: resolved,
    });
    return resolved;
  }

  async handleClientMessage(
    ctx: SessionContext,
    msg: {
      action: string;
      code?: string;
      text?: string;
      model?: string;
      effort?: string;
      mode?: string;
      images?: string[];
      audio?: string;
      audioFilename?: string;
      attachmentFilenames?: string[];
      busyPolicy?: BusyPolicy;
      story?: Array<{
        id: string;
        type: string;
        message: string;
        timestamp: string;
        details?: string;
      }>;
    },
  ): Promise<void> {
    const handlers: Record<string, () => Promise<void> | void> = {
      [WS_ACTION.CHECK_AUTH_STATUS]: () => this.checkAndSendAuthStatus(ctx),
      [WS_ACTION.INITIATE_AUTH]: () => this.handleInitiateAuth(ctx),
      [WS_ACTION.SUBMIT_AUTH_CODE]: () =>
        this.handleSubmitAuthCode(ctx, msg.code ?? ''),
      [WS_ACTION.CANCEL_AUTH]: () => this.handleCancelAuth(ctx),
      [WS_ACTION.REAUTHENTICATE]: () => this.handleReauthenticate(ctx),
      [WS_ACTION.LOGOUT]: () => this.handleLogout(ctx),
      [WS_ACTION.SEND_CHAT_MESSAGE]: async () => {
        const processing = this.sessionRegistry.processingForConversation(
          ctx.conversationId,
        );
        if (processing) {
          await this.handleBusyMessage(processing, ctx, {
            text: msg.text ?? '',
            images: msg.images,
            audio: msg.audio,
            audioFilename: msg.audioFilename,
            attachmentFilenames: msg.attachmentFilenames,
            busyPolicy: msg.busyPolicy ?? 'queue',
          });
        } else {
          await this.handleChatMessage(
            ctx,
            msg.text ?? '',
            msg.images,
            msg.audio,
            msg.audioFilename,
            msg.attachmentFilenames,
          );
        }
      },
      [WS_ACTION.QUEUE_MESSAGE]: () =>
        this.handleControlMessage('queue', ctx, { text: msg.text ?? '' }),
      [WS_ACTION.STEER_MESSAGE]: () =>
        this.handleControlMessage('steer', ctx, { text: msg.text ?? '' }),
      [WS_ACTION.SUBMIT_STORY]: () =>
        this.handleSubmitStory(ctx, msg.story ?? []),
      [WS_ACTION.GET_MODEL]: () => this.handleGetModel(ctx),
      [WS_ACTION.SET_MODEL]: () => this.handleSetModel(ctx, msg.model ?? ''),
      [WS_ACTION.GET_EFFORT]: () => this.handleGetEffort(ctx),
      [WS_ACTION.SET_EFFORT]: () => this.handleSetEffort(ctx, msg.effort ?? ''),
      [WS_ACTION.INTERRUPT_AGENT]: () => this.handleInterruptControl(ctx),
      [WS_ACTION.SET_AGENT_MODE]: () => this.handleSetAgentMode(msg.mode ?? ''),
      [WS_ACTION.ANSWER_USER_QUESTION]: () =>
        this.handleAnswerUserQuestion(
          (msg as { questionId?: string; answer?: string }).questionId ?? '',
          (msg as { answer?: string }).answer ?? '',
        ),
      [WS_ACTION.CONFIRM_ACTION_RESPONSE]: () =>
        this.handleConfirmActionResponse(
          (msg as { questionId?: string; confirmed?: boolean }).questionId ??
            '',
          !!(msg as { confirmed?: boolean }).confirmed,
        ),
      [WS_ACTION.RESET_CONVERSATION]: () => this.handleResetConversation(ctx),
    };

    const handler = handlers[msg.action];
    if (handler) {
      await handler();
    } else {
      this.logger.warn(`Unknown action: ${msg.action}`);
    }
  }

  handleClientConnected(ctx: SessionContext): void {
    ctx.isAuthenticated = this.sharedIsAuthenticated;
    ctx.cachedSystemPromptFromFile = this.sharedSystemPromptFromFile;
    const anyProcessing = this.sessionRegistry
      .all()
      .some((s) => s.isProcessing);
    const isConversationProcessing =
      ctx.isProcessing ||
      this.sessionRegistry.isConversationProcessing(
        ctx.conversationId,
        ctx.sessionId,
      );
    ctx.send(WS_EVENT.AUTH_STATUS, {
      status: ctx.isAuthenticated
        ? AUTH_STATUS_VAL.AUTHENTICATED
        : AUTH_STATUS_VAL.UNAUTHENTICATED,
      isProcessing: isConversationProcessing,
      anyProcessing,
    });
    ctx.send(WS_EVENT.ACTIVITY_SNAPSHOT, {
      activity: this.stores(ctx).activityStore.all(),
    });
    ctx.send(WS_EVENT.AGENT_MODE_UPDATED, { mode: this.agentModeStore.get() });
    ctx.send(WS_EVENT.MODEL_UPDATED, { model: this.effectiveModel() });
    ctx.send(WS_EVENT.EFFORT_UPDATED, { effort: this.effectiveEffort() });
  }

  private async checkAndSendAuthStatus(ctx: SessionContext): Promise<void> {
    const authenticated = await ctx.strategy.checkAuthStatus();
    this.sharedIsAuthenticated = authenticated;
    // Single pass: set auth flag, compute anyProcessing, and emit — no repeated all() calls
    const sessions = this.sessionRegistry.all();
    const anyProcessing = sessions.some((s) => s.isProcessing);
    for (const s of sessions) {
      s.isAuthenticated = authenticated;
      const isConversationProcessing =
        s.isProcessing ||
        this.sessionRegistry.isConversationProcessing(
          s.conversationId,
          s.sessionId,
        );
      s.send(WS_EVENT.AUTH_STATUS, {
        status: authenticated
          ? AUTH_STATUS_VAL.AUTHENTICATED
          : AUTH_STATUS_VAL.UNAUTHENTICATED,
        isProcessing: isConversationProcessing,
        anyProcessing,
      });
    }
  }

  private async handleInitiateAuth(ctx: SessionContext): Promise<void> {
    const currentlyAuthenticated = await ctx.strategy.checkAuthStatus();
    if (currentlyAuthenticated) {
      this.setAllSessionsAuthenticated(true);
      this.sessionRegistry.broadcast(WS_EVENT.AUTH_SUCCESS);
    } else {
      const connection = this.createAuthConnection(ctx);
      ctx.strategy.executeAuth(connection);
    }
  }

  private handleSubmitAuthCode(ctx: SessionContext, code: string): void {
    ctx.strategy.submitAuthCode(code);
  }

  private handleCancelAuth(ctx: SessionContext): void {
    ctx.strategy.cancelAuth();
    this.setAllSessionsAuthenticated(false);
    this.sessionRegistry.broadcast(WS_EVENT.AUTH_STATUS, {
      status: AUTH_STATUS_VAL.UNAUTHENTICATED,
      anyProcessing: false,
    });
  }

  private async handleReauthenticate(ctx: SessionContext): Promise<void> {
    ctx.strategy.cancelAuth();
    ctx.strategy.clearCredentials();
    this.setAllSessionsAuthenticated(false);
    this.sessionRegistry.broadcast(WS_EVENT.AUTH_STATUS, {
      status: AUTH_STATUS_VAL.UNAUTHENTICATED,
      anyProcessing: false,
    });
    const connection = this.createAuthConnection(ctx);
    ctx.strategy.executeAuth(connection);
  }

  private handleLogout(ctx: SessionContext): void {
    ctx.strategy.cancelAuth();
    this.setAllSessionsAuthenticated(false);
    // Single pass: clear processing flag on all sessions
    for (const s of this.sessionRegistry.all()) s.isProcessing = false;
    this.sessionRegistry.broadcast(WS_EVENT.AUTH_STATUS, {
      status: AUTH_STATUS_VAL.UNAUTHENTICATED,
      anyProcessing: false,
    });
    const connection = this.createLogoutConnection(ctx);
    ctx.strategy.executeLogout(connection);
  }

  private setAllSessionsAuthenticated(authenticated: boolean): void {
    this.sharedIsAuthenticated = authenticated;
    for (const s of this.sessionRegistry.all())
      s.isAuthenticated = authenticated;
  }

  async sendMessageFromApi(
    text: string,
    conversationId?: string,
    images?: string[],
    attachmentFilenames?: string[],
    busyPolicy: BusyPolicy = 'reject',
  ): Promise<{
    accepted: boolean;
    messageId?: string;
    error?: string;
    reason?: string;
    conversationId?: string;
    resolvedPolicy?: string;
    queueCount?: number;
  }> {
    const requestedConversationId = conversationId?.trim();
    const activeProcessing = this.processingSessions();
    if (
      (busyPolicy === 'queue' || busyPolicy === 'steer') &&
      activeProcessing.length > 0
    ) {
      const resolution = this.resolveControlTarget(
        requestedConversationId,
        busyPolicy,
      );
      if (!resolution.accepted) {
        return this.controlFailureForSendMessage(resolution.result);
      }
      const result = await this.acceptBusyMessage(
        resolution.ctx,
        resolution.ctx,
        {
          text,
          images,
          attachmentFilenames,
          busyPolicy,
        },
      );
      return {
        ...result,
        conversationId: resolution.ctx.conversationId,
        queueCount: resolution.ctx.queuedTurns.length,
      };
    }

    if (!requestedConversationId && activeProcessing.length > 0) {
      if (activeProcessing.length > 1) {
        return {
          accepted: false,
          error: ERROR_CODE.AGENT_BUSY,
          reason: 'Multiple active agent runs; provide conversationId.',
        };
      }
      const onlyActive = activeProcessing[0];
      return {
        accepted: false,
        error: ERROR_CODE.AGENT_BUSY,
        reason: 'Agent run is active; provide conversationId or a queue/steer busyPolicy.',
        ...(onlyActive ? { conversationId: onlyActive.conversationId } : {}),
      };
    }

    const targetConversationId = requestedConversationId || INBOX_CONVERSATION_ID;
    if (!this.conversationManager.get(targetConversationId)) {
      return { accepted: false, error: 'Conversation not found' };
    }

    const processing =
      this.sessionRegistry.processingForConversation(targetConversationId);
    if (processing) {
      return this.acceptBusyMessage(processing, processing, {
        text,
        images,
        attachmentFilenames,
        busyPolicy,
      });
    }

    let ctx = this.findIdleSession(targetConversationId);
    if (!ctx) {
      ctx = this.sessionRegistry.create(targetConversationId, false);
    }
    await this.checkAndSendAuthStatus(ctx);
    if (!ctx.isAuthenticated)
      return { accepted: false, error: ERROR_CODE.NEED_AUTH };
    ctx.isProcessing = true;
    const {
      messageId,
      text: _text,
      imageUrls: urls,
      audioFilename: af,
      attachmentFilenames: att,
    } = await this.addUserMessageAndEmit(
      ctx,
      text,
      images,
      undefined,
      undefined,
      attachmentFilenames,
    );
    void this.runAgentResponse(ctx, _text, urls, af, att)
      .then(() => this.drainQueuedTurns(ctx))
      .catch((err) =>
        this.logger.warn('REST send-message agent run failed', err),
      );
    return { accepted: true, messageId, conversationId: ctx.conversationId };
  }

  interruptFromApi(conversationId?: string): AgentControlResult {
    const resolution = this.resolveControlTarget(
      conversationId?.trim(),
      'interrupt',
    );
    if (!resolution.accepted) {
      return { ...resolution.result, interrupted: false };
    }

    resolution.ctx.strategy.interruptAgent?.();
    return {
      accepted: true,
      action: 'interrupt',
      interrupted: true,
      conversationId: resolution.ctx.conversationId,
    };
  }

  removeQueuedTurnFromApi(
    conversationId: string | undefined,
    turnId: string,
  ): {
    removed: boolean;
    conversationId?: string;
    queueCount?: number;
    messageId?: string;
  } {
    const normalizedTurnId = turnId.trim();
    if (!normalizedTurnId) return { removed: false };

    const targetConversationId = conversationId?.trim();
    const ctx = targetConversationId
      ? this.sessionRegistry.processingForConversation(targetConversationId)
      : this.sessionRegistry
          .all()
          .find(
            (session) => session.isProcessing && session.queuedTurns.length > 0,
          );
    if (!ctx) return { removed: false };

    const numericIndex = Number.parseInt(normalizedTurnId, 10);
    const index = ctx.queuedTurns.findIndex(
      (turn, candidateIndex) =>
        turn.id === normalizedTurnId ||
        (!Number.isNaN(numericIndex) &&
          String(numericIndex) === normalizedTurnId &&
          candidateIndex === numericIndex),
    );
    if (index < 0)
      return {
        removed: false,
        conversationId: ctx.conversationId,
        queueCount: ctx.queuedTurns.length,
      };

    const [removed] = ctx.queuedTurns.splice(index, 1);
    if (removed?.messageId) {
      this.stores(ctx).messageStore.removeById(removed.messageId);
    }
    return {
      removed: true,
      conversationId: ctx.conversationId,
      queueCount: ctx.queuedTurns.length,
      messageId: removed?.messageId,
    };
  }

  async updateQueuedTurnFromApi(
    conversationId: string | undefined,
    turnId: string,
    payload: { text?: string; policy?: Exclude<BusyPolicy, 'reject'> },
  ): Promise<{
    updated: boolean;
    conversationId?: string;
    queueCount?: number;
    messageId?: string;
  }> {
    const normalizedTurnId = turnId.trim();
    if (!normalizedTurnId) return { updated: false };

    const targetConversationId = conversationId?.trim();
    const ctx = targetConversationId
      ? this.sessionRegistry.processingForConversation(targetConversationId)
      : this.sessionRegistry
          .all()
          .find(
            (session) => session.isProcessing && session.queuedTurns.length > 0,
          );
    if (!ctx) return { updated: false };

    const turn = this.findQueuedTurn(ctx, normalizedTurnId);
    if (!turn)
      return {
        updated: false,
        conversationId: ctx.conversationId,
        queueCount: ctx.queuedTurns.length,
      };

    const nextText = payload.text?.trim();
    if (nextText) {
      turn.displayText = nextText;
      if (turn.policy === 'queue') turn.text = nextText;
      this.stores(ctx).messageStore.updateBody(turn.messageId, nextText);
    }
    if (payload.policy === 'queue' || payload.policy === 'steer') {
      const previousPolicy = turn.policy;
      turn.policy = payload.policy;
      if (payload.policy === 'queue' && turn.displayText)
        turn.text = turn.displayText;
      if (
        payload.policy === 'steer' &&
        previousPolicy !== 'steer' &&
        turn.displayText &&
        ctx.strategy.steerAgent
      ) {
        const steerResult = await ctx.strategy.steerAgent(turn.displayText);
        if (steerResult === 'handled') {
          ctx.queuedTurns = ctx.queuedTurns.filter((queued) => queued !== turn);
          return {
            updated: true,
            conversationId: ctx.conversationId,
            queueCount: ctx.queuedTurns.length,
            messageId: turn.messageId,
          };
        }
        turn.text = '';
      }
    }

    return {
      updated: true,
      conversationId: ctx.conversationId,
      queueCount: ctx.queuedTurns.length,
      messageId: turn.messageId,
    };
  }

  reorderQueuedTurnsFromApi(
    conversationId: string | undefined,
    turnIds: string[],
  ): { reordered: boolean; conversationId?: string; queueCount?: number } {
    const targetConversationId = conversationId?.trim();
    const ctx = targetConversationId
      ? this.sessionRegistry.processingForConversation(targetConversationId)
      : this.sessionRegistry
          .all()
          .find(
            (session) => session.isProcessing && session.queuedTurns.length > 0,
          );
    if (!ctx) return { reordered: false };

    const byId = new Map<string, QueuedAgentTurn>(
      ctx.queuedTurns.map((turn, index) => [turn.id || String(index), turn]),
    );
    const used = new Set<string>();
    const ordered = turnIds
      .map((id) => {
        const turn = byId.get(id);
        if (turn) used.add(id);
        return turn;
      })
      .filter((turn): turn is QueuedAgentTurn => Boolean(turn));
    const rest = ctx.queuedTurns.filter(
      (turn, index) => !used.has(turn.id || String(index)),
    );
    ctx.queuedTurns = [...ordered, ...rest];
    return {
      reordered: true,
      conversationId: ctx.conversationId,
      queueCount: ctx.queuedTurns.length,
    };
  }

  private findQueuedTurn(
    ctx: SessionContext,
    turnId: string,
  ): QueuedAgentTurn | undefined {
    const numericIndex = Number.parseInt(turnId, 10);
    return ctx.queuedTurns.find(
      (turn, candidateIndex) =>
        turn.id === turnId ||
        (!Number.isNaN(numericIndex) &&
          String(numericIndex) === turnId &&
          candidateIndex === numericIndex),
    );
  }

  private processingSessions(): SessionContext[] {
    return this.sessionRegistry.all().filter((session) => session.isProcessing);
  }

  private resolveControlTarget(
    conversationId: string | undefined,
    action: AgentControlAction,
  ): ControlTargetResolution {
    const targetConversationId = conversationId?.trim();
    if (targetConversationId) {
      const ctx =
        this.sessionRegistry.processingForConversation(targetConversationId);
      if (ctx) return { accepted: true, ctx };

      if (!this.conversationManager.get(targetConversationId)) {
        return {
          accepted: false,
          result: {
            accepted: false,
            action,
            conversationId: targetConversationId,
            error: 'Conversation not found',
            reason: 'Conversation not found',
          },
        };
      }
      const reason = `No active agent run for conversation ${targetConversationId}.`;
      return {
        accepted: false,
        result: {
          accepted: false,
          action,
          conversationId: targetConversationId,
          error: ERROR_CODE.AGENT_BUSY,
          reason,
        },
      };
    }

    const active = this.processingSessions();
    const onlyActive = active[0];
    if (active.length === 1 && onlyActive) return { accepted: true, ctx: onlyActive };
    const reason =
      active.length === 0
        ? 'No active agent run.'
        : 'Multiple active agent runs; provide conversationId.';
    return {
      accepted: false,
      result: {
        accepted: false,
        action,
        error: ERROR_CODE.AGENT_BUSY,
        reason,
      },
    };
  }

  private controlFailureForSendMessage(result: AgentControlResult): {
    accepted: false;
    error: string;
    reason: string;
    conversationId?: string;
  } {
    return {
      accepted: false,
      error: result.error ?? ERROR_CODE.AGENT_BUSY,
      reason: result.reason ?? result.error ?? ERROR_CODE.AGENT_BUSY,
      ...(result.conversationId ? { conversationId: result.conversationId } : {}),
    };
  }

  private emitControlResult(
    requesterCtx: SessionContext,
    result: AgentControlResult,
  ): void {
    requesterCtx.send(
      WS_EVENT.CONTROL_RESULT,
      result as unknown as Record<string, unknown>,
    );
    if (!result.accepted) {
      requesterCtx.send(WS_EVENT.ERROR, {
        message: result.reason ?? result.error ?? ERROR_CODE.AGENT_BUSY,
      });
    }
  }

  private handleInterruptControl(requesterCtx: SessionContext): void {
    const resolution = this.resolveControlTarget(
      requesterCtx.conversationId,
      'interrupt',
    );
    if (!resolution.accepted) {
      this.emitControlResult(requesterCtx, {
        ...resolution.result,
        interrupted: false,
      });
      return;
    }

    resolution.ctx.strategy.interruptAgent?.();
    this.emitControlResult(requesterCtx, {
      accepted: true,
      action: 'interrupt',
      interrupted: true,
      conversationId: resolution.ctx.conversationId,
    });
  }

  private async handleControlMessage(
    action: Exclude<AgentControlAction, 'interrupt'>,
    requesterCtx: SessionContext,
    payload: {
      text: string;
      images?: string[];
      audio?: string;
      audioFilename?: string;
      attachmentFilenames?: string[];
    },
  ): Promise<void> {
    const resolution = this.resolveControlTarget(
      requesterCtx.conversationId,
      action,
    );
    if (!resolution.accepted) {
      this.emitControlResult(requesterCtx, resolution.result);
      return;
    }

    const result = await this.acceptBusyMessage(
      resolution.ctx,
      requesterCtx,
      { ...payload, busyPolicy: action },
    );
    this.emitControlResult(requesterCtx, {
      accepted: result.accepted,
      action,
      conversationId: resolution.ctx.conversationId,
      messageId: result.messageId,
      resolvedPolicy: result.resolvedPolicy,
      queueCount: resolution.ctx.queuedTurns.length,
      error: result.error,
      reason: result.error,
    });
  }

  /**
   * Find an idle session. When a conversationId is supplied, a session already
   * bound to that conversation is preferred to maintain context continuity.
   */
  private findIdleSession(conversationId?: string): SessionContext | undefined {
    const sessions = this.sessionRegistry.all();
    if (conversationId)
      return sessions.find(
        (s) => s.conversationId === conversationId && !s.isProcessing,
      );
    return sessions.find((s) => !s.isProcessing);
  }

  private async addUserMessageAndEmit(
    ctx: SessionContext,
    text: string,
    images?: string[],
    audio?: string,
    audioFilenameFromClient?: string,
    attachmentFilenames?: string[],
  ): Promise<{
    messageId: string;
    text: string;
    imageUrls: string[];
    audioFilename: string | null;
    attachmentFilenames: string[] | undefined;
  }> {
    const imageUrls: string[] = [];
    if (images?.length) {
      for (const dataUrl of images) {
        try {
          imageUrls.push(
            await this.uploadsService.saveImage(dataUrl, ctx.conversationId),
          );
        } catch {
          this.logger.warn('Failed to save one image, skipping');
        }
      }
    }
    let audioFilename: string | null = audioFilenameFromClient ?? null;
    if (!audioFilename && audio) {
      try {
        audioFilename = await this.uploadsService.saveAudio(
          audio,
          ctx.conversationId,
        );
      } catch {
        this.logger.warn('Failed to save voice recording, skipping');
      }
    }
    const { messageStore: ctxMsgStore } = this.stores(ctx);
    const userMessage = ctxMsgStore.add(
      'user',
      text,
      imageUrls.length ? imageUrls : undefined,
      undefined,
      attachmentFilenames?.length ? attachmentFilenames : undefined,
    );
    await ctxMsgStore.flush();
    void this.fibeSync.syncMessages(
      () => JSON.stringify(ctxMsgStore.all()),
      ctx.conversationId,
    );
    this.sessionRegistry.broadcastToConversation(
      ctx.conversationId,
      WS_EVENT.MESSAGE,
      userMessage as unknown as Record<string, unknown>,
    );
    this.conversationManager.touch(ctx.conversationId);
    return {
      messageId: userMessage.id,
      text,
      imageUrls,
      audioFilename,
      attachmentFilenames,
    };
  }

  private async runAgentResponse(
    ctx: SessionContext,
    text: string,
    imageUrls: string[],
    audioFilename: string | null,
    attachmentFilenames?: string[],
  ): Promise<void> {
    let accumulated = '';
    const syntheticStepId = 'generating-response';
    const syntheticStep: ThinkingStep = {
      id: syntheticStepId,
      title: 'Generating response',
      status: 'processing',
      timestamp: new Date(),
    };
    ctx.lastError = null;
    try {
      let systemPrompt = '';
      const configSystemPrompt = this.config.getSystemPrompt();
      if (configSystemPrompt) {
        systemPrompt = configSystemPrompt;
      } else if (ctx.cachedSystemPromptFromFile !== null) {
        systemPrompt = ctx.cachedSystemPromptFromFile;
      }
      // Only inject prompt-level history for strategies without native session support.
      // Strategies like Claude Code use --resume which restores full context natively.
      const historyMessages = ctx.strategy.hasNativeSessionSupport?.()
        ? undefined
        : (() => {
            const allMessages = this.stores(ctx).messageStore.all();
            return allMessages.length > 1
              ? allMessages
                  .slice(0, -1)
                  .map((m) => ({ role: m.role, body: m.body }))
              : undefined;
          })();

      // Gemma pre-pass: classify user intent → inject MCP tool hints into the prompt.
      // Runs only when GEMMA_ROUTER_ENABLED=true and Ollama is reachable.
      // Stored chat history is never modified — only the built prompt changes.
      let routedText = text;
      if (this.config.isGemmaRouterEnabled()) {
        const mcpTools = this.gemmaMcpTools.getTools();
        this.logger.log(
          `[GemmaRouter] input: "${text.slice(0, 80)}", tools: ${mcpTools.length}`,
        );
        if (mcpTools.length) {
          const gemmaResult = await this.gemmaRouter.analyze(text, mcpTools);
          this.logger.log(
            `[GemmaRouter] result: ${JSON.stringify(gemmaResult)}`,
          );
          if (!gemmaResult.skipped && gemmaResult.action) {
            const action = gemmaResult.action;
            if (action.type === 'EXECUTE_CLI') {
              await this.executeCliDirectly(
                ctx,
                action.command,
                syntheticStepId,
                syntheticStep,
              );
              return; // Short-circuit Big LLM
            } else if (action.type === 'DELEGATE_TO_AGENT') {
              if (
                action.confidence >= this.config.getGemmaConfidenceThreshold()
              ) {
                routedText = this.chatPromptContext.injectToolHint(
                  text,
                  action.tools,
                  action.confidence,
                );
                this.logger.log(
                  `[GemmaRouter] injected hint — tools: [${action.tools.join(', ')}], confidence: ${Math.round(action.confidence * 100)}%`,
                );
              } else {
                this.logger.log(
                  `[GemmaRouter] no hint injected — confidence: ${action.confidence}`,
                );
              }
            }
          } else {
            this.logger.log(`[GemmaRouter] skipped`);
          }
        }
      }

      // Mode hint injection — tells the agent CLI what mode the operator has set.
      // Applied after Gemma routing so the mode frame is the outermost context.
      const currentMode = this.agentModeStore.get();
      routedText = this.chatPromptContext.injectModeHint(
        routedText,
        currentMode,
      );

      const fullPrompt = await this.chatPromptContext.buildFullPrompt(
        routedText,
        imageUrls,
        audioFilename,
        attachmentFilenames,
        historyMessages,
        ctx.conversationId,
      );
      const model = this.effectiveModel();
      const effort = this.effectiveEffort();
      const previousAssistantMessages = this.stores(ctx).messageStore
        .all()
        .filter((message) => message.role === 'assistant')
        .map((message) => message.body);
      // Broadcast stream-start to all tabs in this conversation
      this.sessionRegistry.broadcastToConversation(
        ctx.conversationId,
        WS_EVENT.STREAM_START,
        { model },
      );
      ctx.streamTextAccumulated = '';
      ctx.streamStartedAt = new Date().toISOString();
      ctx.lastStreamText = '';
      ctx.lastStreamStartedAt = null;
      ctx.lastStreamFinishedAt = null;
      const streamStartEntry: StoredStoryEntry = {
        id: randomUUID(),
        type: 'stream_start',
        message: 'Response started',
        timestamp: new Date().toISOString(),
        details: model ? `Model: ${model}` : undefined,
      };
      const { activityStore: rAct } = this.stores(ctx);
      const currentActivity = rAct.createWithEntry(streamStartEntry);
      ctx.currentActivityId = currentActivity.id;
      ctx.reasoningTextAccumulated = '';
      this.sessionRegistry.broadcastToConversation(
        ctx.conversationId,
        WS_EVENT.ACTIVITY_APPENDED,
        { entry: currentActivity },
      );
      this.sessionRegistry.broadcastToConversation(
        ctx.conversationId,
        WS_EVENT.THINKING_STEP,
        {
          id: syntheticStep.id,
          title: syntheticStep.title,
          status: syntheticStep.status,
          details: syntheticStep.details,
          timestamp: syntheticStep.timestamp.toISOString(),
        },
      );
      ctx.lastStreamUsage = undefined;
      // Helper to fan-out per-stream events to all tabs watching this conversation
      const bcastConv = (type: string, data?: Record<string, unknown>) =>
        this.sessionRegistry.broadcastToConversation(
          ctx.conversationId,
          type,
          data ?? {},
        );
      const streamDeps = {
        send: bcastConv,
        activityStore: rAct,
        getCurrentActivityId: () => ctx.currentActivityId,
        getReasoningText: () => ctx.reasoningTextAccumulated,
        appendReasoningText: (t: string) => {
          ctx.reasoningTextAccumulated += t;
        },
        clearReasoningText: () => {
          ctx.reasoningTextAccumulated = '';
        },
        setLastStreamUsage: (u: TokenUsage | undefined) => {
          ctx.lastStreamUsage = u;
        },
      };
      const callbacks = createStreamingCallbacks(streamDeps);
      const modeTriggerStream = createAgentModeTriggerStream((mode) => {
        this.setAgentMode(mode);
      });
      const emitVisibleChunk = (chunk: string) => {
        if (!chunk) return;
        accumulated += chunk;
        ctx.streamTextAccumulated += chunk;
        // Fan-out stream chunks to every tab watching this conversation
        this.sessionRegistry.broadcastToConversation(
          ctx.conversationId,
          WS_EVENT.STREAM_CHUNK,
          { text: chunk },
        );
      };
      await ctx.strategy.executePromptStreaming(
        fullPrompt,
        model,
        (chunk) => {
          emitVisibleChunk(modeTriggerStream.push(chunk));
        },
        callbacks,
        systemPrompt || undefined,
        { effort, previousAssistantMessages },
      );
      ctx.pendingSteerRestart = false;
      emitVisibleChunk(modeTriggerStream.flush());
      finishAgentStream(
        this.finishStreamDeps(ctx),
        accumulated,
        syntheticStepId,
        syntheticStep,
        ctx.lastStreamUsage,
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw === INTERRUPTED_MESSAGE) {
        if (accumulated.trim()) {
          finishAgentStream(
            this.finishStreamDeps(ctx),
            accumulated,
            syntheticStepId,
            syntheticStep,
            ctx.lastStreamUsage,
          );
        } else if (ctx.pendingSteerRestart) {
          ctx.send(WS_EVENT.THINKING_STEP, {
            id: syntheticStep.id,
            title: syntheticStep.title,
            status: 'complete',
            details: 'Restarting with operator steering.',
            timestamp: new Date().toISOString(),
          });
          if (ctx.reasoningTextAccumulated) {
            ctx.send(WS_EVENT.REASONING_END, {});
            ctx.reasoningTextAccumulated = '';
          }
          ctx.currentActivityId = null;
          ctx.lastStreamUsage = undefined;
          ctx.pendingSteerRestart = false;
        } else {
          ctx.send(WS_EVENT.THINKING_STEP, {
            id: syntheticStep.id,
            title: syntheticStep.title,
            status: 'complete',
            details: 'Interrupted before producing output.',
            timestamp: new Date().toISOString(),
          });
          if (ctx.reasoningTextAccumulated) {
            ctx.send(WS_EVENT.REASONING_END, {});
            ctx.reasoningTextAccumulated = '';
          }
          ctx.currentActivityId = null;
          ctx.lastStreamUsage = undefined;
          ctx.send(WS_EVENT.ERROR, {
            message: 'Interrupted before producing output.',
          });
        }
      } else {
        const message =
          raw.length > 500 ? raw.slice(0, 500).trim() + '...' : raw;
        ctx.lastError = message;
        if (isProviderAuthFailureMessage(message)) {
          this.isAuthenticated = false;
        }
        ctx.send(WS_EVENT.THINKING_STEP, {
          id: syntheticStep.id,
          title: syntheticStep.title,
          status: 'complete',
          details: message,
          timestamp: new Date().toISOString(),
        });
        this.persistAgentErrorActivity(ctx, message);
        if (ctx.reasoningTextAccumulated) {
          ctx.send(WS_EVENT.REASONING_END, {});
          ctx.reasoningTextAccumulated = '';
        }
        ctx.currentActivityId = null;
        ctx.lastStreamUsage = undefined;
        ctx.send(WS_EVENT.ERROR, { message });
      }
    } finally {
      await this.flushStores(ctx);
      ctx.isProcessing = false;
      if (ctx.streamTextAccumulated.trim()) {
        ctx.lastStreamText = ctx.streamTextAccumulated;
        ctx.lastStreamStartedAt = ctx.streamStartedAt;
        ctx.lastStreamFinishedAt = new Date().toISOString();
      } else {
        ctx.lastStreamText = '';
        ctx.lastStreamStartedAt = null;
        ctx.lastStreamFinishedAt = null;
      }
      ctx.streamTextAccumulated = '';
      ctx.streamStartedAt = null;
      // Notify all sessions that no agent is running anymore (anyProcessing may now be false)
      this.sessionRegistry.broadcast(WS_EVENT.SESSIONS_UPDATED, {
        count: this.sessionRegistry.size,
        anyProcessing: this.sessionRegistry.all().some((s) => s.isProcessing),
      });
      this.sessionRegistry.destroyIfDetachedAndIdle(ctx.sessionId);
    }
  }

  private persistAgentErrorActivity(ctx: SessionContext, message: string): void {
    const { activityStore } = this.stores(ctx);
    const activityId = ctx.currentActivityId;
    if (!activityId) return;

    activityStore.appendEntry(activityId, {
      id: randomUUID(),
      type: 'error',
      message: 'Provider turn failed',
      timestamp: new Date().toISOString(),
      details: message,
    });

    const entry = activityStore.getById(activityId);
    if (entry) {
      this.sessionRegistry.broadcastToConversation(
        ctx.conversationId,
        WS_EVENT.ACTIVITY_UPDATED,
        { entry },
      );
    }
    void this.fibeSync.syncActivity(
      () => JSON.stringify(activityStore.all()),
      ctx.conversationId,
    );
  }

  private async handleChatMessage(
    ctx: SessionContext,
    text: string,
    images?: string[],
    audio?: string,
    audioFilenameFromClient?: string,
    attachmentFilenames?: string[],
  ): Promise<void> {
    if (!ctx.isAuthenticated) {
      ctx.send(WS_EVENT.ERROR, { message: ERROR_CODE.NEED_AUTH });
      return;
    }
    ctx.isProcessing = true;
    // Notify all sessions that an agent is now running (anyProcessing = true)
    this.sessionRegistry.broadcast(WS_EVENT.SESSIONS_UPDATED, {
      count: this.sessionRegistry.size,
      anyProcessing: true,
    });
    const {
      text: _t,
      imageUrls,
      audioFilename,
      attachmentFilenames: att,
    } = await this.addUserMessageAndEmit(
      ctx,
      text,
      images,
      audio,
      audioFilenameFromClient,
      attachmentFilenames,
    );
    await this.runAgentResponse(ctx, _t, imageUrls, audioFilename, att);
    await this.drainQueuedTurns(ctx);
  }

  private async handleBusyMessage(
    processingCtx: SessionContext,
    requesterCtx: SessionContext,
    payload: {
      text: string;
      images?: string[];
      audio?: string;
      audioFilename?: string;
      attachmentFilenames?: string[];
      busyPolicy?: BusyPolicy;
    },
  ): Promise<void> {
    const result = await this.acceptBusyMessage(
      processingCtx,
      requesterCtx,
      payload,
    );
    if (!result.accepted) {
      requesterCtx.send(WS_EVENT.ERROR, {
        message: result.error ?? ERROR_CODE.AGENT_BUSY,
      });
    }
  }

  private async acceptBusyMessage(
    processingCtx: SessionContext,
    requesterCtx: SessionContext,
    payload: {
      text: string;
      images?: string[];
      audio?: string;
      audioFilename?: string;
      attachmentFilenames?: string[];
      busyPolicy?: BusyPolicy;
    },
  ): Promise<{
    accepted: boolean;
    messageId?: string;
    error?: string;
    resolvedPolicy?: string;
  }> {
    const text = payload.text.trim();
    if (!text)
      return {
        accepted: false,
        error: 'text is required and must be non-empty',
      };

    const policy = this.normalizeBusyPolicy(payload.busyPolicy);
    if (!processingCtx.isProcessing) {
      if (requesterCtx !== processingCtx)
        requesterCtx.conversationId = processingCtx.conversationId;
      await this.handleChatMessage(
        processingCtx,
        text,
        payload.images,
        payload.audio,
        payload.audioFilename,
        payload.attachmentFilenames,
      );
      return { accepted: true, resolvedPolicy: 'started' };
    }

    if (policy === 'reject') {
      return { accepted: false, error: ERROR_CODE.AGENT_BUSY };
    }

    const saved = await this.addUserMessageAndEmit(
      processingCtx,
      text,
      payload.images,
      payload.audio,
      payload.audioFilename,
      payload.attachmentFilenames,
    );

    let resolvedPolicy: Exclude<BusyPolicy, 'reject'> = 'queue';
    let queuedText = saved.text;
    if (policy === 'steer' && processingCtx.strategy.steerAgent) {
      processingCtx.pendingSteerRestart = true;
      const steerResult = await processingCtx.strategy.steerAgent(saved.text);
      if (steerResult === 'handled') {
        processingCtx.pendingSteerRestart = false;
        return {
          accepted: true,
          messageId: saved.messageId,
          resolvedPolicy: 'steer',
        };
      }
      queuedText = '';
      resolvedPolicy = 'steer';
    }

    processingCtx.queuedTurns.push({
      id: randomUUID(),
      messageId: saved.messageId,
      text: queuedText,
      displayText: saved.text,
      imageUrls: saved.imageUrls,
      audioFilename: saved.audioFilename,
      attachmentFilenames: saved.attachmentFilenames,
      policy: resolvedPolicy,
      createdAt: new Date().toISOString(),
    });
    return { accepted: true, messageId: saved.messageId, resolvedPolicy };
  }

  private async drainQueuedTurns(ctx: SessionContext): Promise<void> {
    while (!ctx.isProcessing && ctx.queuedTurns.length > 0) {
      const next = ctx.queuedTurns.shift() as QueuedAgentTurn;
      ctx.isProcessing = true;
      this.sessionRegistry.broadcast(WS_EVENT.SESSIONS_UPDATED, {
        count: this.sessionRegistry.size,
        anyProcessing: true,
      });
      await this.runAgentResponse(
        ctx,
        next.text,
        next.imageUrls,
        next.audioFilename,
        next.attachmentFilenames,
      );
    }
  }

  private normalizeBusyPolicy(policy: BusyPolicy | undefined): BusyPolicy {
    return policy === 'reject' || policy === 'steer' || policy === 'queue'
      ? policy
      : 'reject';
  }

  private createAuthConnection(ctx: SessionContext): AuthConnection {
    return {
      sendAuthUrlGenerated: (url) =>
        ctx.send(WS_EVENT.AUTH_URL_GENERATED, { url }),
      sendDeviceCode: (code) => ctx.send(WS_EVENT.AUTH_DEVICE_CODE, { code }),
      sendAuthManualToken: () => ctx.send(WS_EVENT.AUTH_MANUAL_TOKEN),
      sendAuthSuccess: () => {
        this.setAllSessionsAuthenticated(true);
        this.sessionRegistry.broadcast(WS_EVENT.AUTH_SUCCESS);
      },
      sendAuthStatus: (status) =>
        ctx.send(WS_EVENT.AUTH_STATUS, {
          status,
          isProcessing: ctx.isProcessing,
        }),
      sendError: (message) => ctx.send(WS_EVENT.ERROR, { message }),
    };
  }

  private createLogoutConnection(ctx: SessionContext): LogoutConnection {
    return {
      sendLogoutOutput: (text) => ctx.send(WS_EVENT.LOGOUT_OUTPUT, { text }),
      sendLogoutSuccess: () => {
        this.setAllSessionsAuthenticated(false);
        this.sessionRegistry.broadcast(WS_EVENT.LOGOUT_SUCCESS);
      },
      sendError: (message) => ctx.send(WS_EVENT.ERROR, { message }),
    };
  }

  private async handleSubmitStory(
    ctx: SessionContext,
    story: StoredStoryEntry[],
  ): Promise<void> {
    const { messageStore: sMsg, activityStore: sAct } = this.stores(ctx);
    if (ctx.currentActivityId) {
      const entry = sAct.getById(ctx.currentActivityId);
      const backendStory = entry?.story ?? [];
      const useClientStory = story.length > backendStory.length;
      const storyToUse = useClientStory ? story : backendStory;
      if (useClientStory && entry)
        sAct.replaceStory(ctx.currentActivityId, story);
      sMsg.finalizeLastAssistant(storyToUse, ctx.currentActivityId);
      const finalEntry = sAct.getById(ctx.currentActivityId);
      if (finalEntry) {
        this.sessionRegistry.broadcastToConversation(
          ctx.conversationId,
          WS_EVENT.ACTIVITY_UPDATED,
          { entry: finalEntry },
        );
      }
      ctx.currentActivityId = null;
    } else {
      // If currentActivityId is null, this might be a duplicate submission from a second tab.
      // Instead of appending a new activity, we just update the last assistant message's story if it exists.
      this.logger.debug(
        'Received submit_story but currentActivityId is null (possible duplicate from another tab).',
      );
      const allMessages = sMsg.all();
      const lastMsg = allMessages[allMessages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        const backendStory = lastMsg.story ?? [];
        const useClientStory = story.length > backendStory.length;
        if (useClientStory) {
          sMsg.finalizeLastAssistant(story, lastMsg.activityId);
          if (lastMsg.activityId) {
            sAct.replaceStory(lastMsg.activityId, story);
          }
        }
      }
    }
    void this.fibeSync.syncMessages(
      () => JSON.stringify(sMsg.all()),
      ctx.conversationId,
    );
    void this.fibeSync.syncActivity(
      () => JSON.stringify(sAct.all()),
      ctx.conversationId,
    );
    await Promise.all([sMsg.flush(), sAct.flush()]);
  }

  // ── Global model / effort helpers ───────────────────────────────────

  private effectiveModel(): string {
    return this.modelStore.get();
  }

  private effectiveEffort(): string {
    return this.effortStore.get();
  }

  private handleGetModel(ctx: SessionContext): void {
    ctx.send(WS_EVENT.MODEL_UPDATED, { model: this.effectiveModel() });
  }

  private async handleSetModel(
    ctx: SessionContext,
    model: string,
  ): Promise<void> {
    const value = this.modelStore.set(model);
    await this.modelStore.flush();
    this.sessionRegistry.broadcast(WS_EVENT.MODEL_UPDATED, { model: value });
  }

  private handleGetEffort(ctx: SessionContext): void {
    ctx.send(WS_EVENT.EFFORT_UPDATED, { effort: this.effectiveEffort() });
  }

  private async handleSetEffort(
    ctx: SessionContext,
    effort: string,
  ): Promise<void> {
    const value = this.effortStore.set(effort);
    await this.effortStore.flush();
    this.sessionRegistry.broadcast(WS_EVENT.EFFORT_UPDATED, { effort: value });
  }

  private handleAnswerUserQuestion(questionId: string, answer: string): void {
    this.localMcp.resolveQuestion(questionId, { answer });
  }

  private handleConfirmActionResponse(
    questionId: string,
    confirmed: boolean,
  ): void {
    this.localMcp.resolveQuestion(questionId, { confirmed });
  }

  private handleSetAgentMode(mode: string): void {
    const resolved = this.setAgentMode(mode);
    if (!resolved) {
      this.logger.warn(`SET_AGENT_MODE: invalid mode "${mode}" — ignoring`);
    }
  }

  /**
   * Reset the conversation: archive messages, clear stores, notify all connected clients.
   * Refused while the agent is actively processing a request.
   */
  private async handleResetConversation(ctx: SessionContext): Promise<void> {
    // Refuse if ANY session is actively processing (any tab's agent is running)
    if (this.sessionRegistry.all().some((s) => s.isProcessing)) {
      ctx.send(WS_EVENT.ERROR, {
        message: 'Cannot reset while the agent is processing a request.',
      });
      return;
    }
    const resetAt = new Date().toISOString();
    const { messageStore: rMsg, activityStore: rAct } = this.stores(ctx);
    rMsg.reset();
    rAct.clear();
    await this.flushStores(ctx);
    this.logger.log(
      `Conversation reset at ${resetAt} (conversation: ${ctx.conversationId})`,
    );
    this.sessionRegistry.broadcastToConversation(
      ctx.conversationId,
      WS_EVENT.CONVERSATION_RESET,
      { resetAt },
    );
  }

  private async executeCliDirectly(
    ctx: SessionContext,
    command: string,
    syntheticStepId: string,
    syntheticStep: ThinkingStep,
  ): Promise<void> {
    this.logger.log(`[GemmaRouter] executing CLI directly: ${command}`);
    const model = 'CLI Router';
    ctx.send(WS_EVENT.STREAM_START, { model });
    const streamStartEntry: StoredStoryEntry = {
      id: randomUUID(),
      type: 'stream_start',
      message: 'Response started',
      timestamp: new Date().toISOString(),
      details: `Model: ${model}`,
    };
    const { activityStore: cliAct } = this.stores(ctx);
    const currentActivity = cliAct.createWithEntry(streamStartEntry);
    ctx.currentActivityId = currentActivity.id;
    ctx.send(WS_EVENT.ACTIVITY_APPENDED, { entry: currentActivity });

    const execAsync = promisify(exec);
    let cliOut = `> ${command}\n\n`;
    ctx.send(WS_EVENT.STREAM_CHUNK, { text: cliOut });

    try {
      const envPath = `${process.env['DATA_DIR'] || '/app/data'}/.fibe/bin:/usr/local/bin:${process.env.PATH || ''}`;
      const { stdout, stderr } = await execAsync(command, {
        env: { ...process.env, PATH: envPath },
      });
      const output =
        stdout || stderr || 'Command executed successfully with no output.';
      cliOut += output;
      ctx.send(WS_EVENT.STREAM_CHUNK, { text: output });
    } catch (e) {
      const errText = e instanceof Error ? e.message : String(e);
      cliOut += `Error: ${errText}`;
      ctx.send(WS_EVENT.STREAM_CHUNK, { text: `Error: ${errText}` });
    }
    finishAgentStream(
      this.finishStreamDeps(ctx),
      cliOut,
      syntheticStepId,
      syntheticStep,
      undefined,
    );
  }
}
