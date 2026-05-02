import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { isProviderAuthFailureMessage } from '@shared/provider-auth-errors';
import { Subject } from 'rxjs';
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
import { UploadsService } from '../uploads/uploads.service';
import type {
  AgentStrategy,
  AuthConnection,
  LogoutConnection,
  ThinkingStep,
  TokenUsage,
} from '../strategies/strategy.types';
import { INTERRUPTED_MESSAGE } from '../strategies/strategy.types';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import {
  AUTH_STATUS as AUTH_STATUS_VAL,
  ERROR_CODE,
  WS_ACTION,
  WS_EVENT,
} from '@shared/ws-constants';
import type { AgentModeValue } from '@shared/agent-mode.constants';

import { writeMcpConfig } from '../config/mcp-config-writer';

import { ChatPromptContextService } from './chat-prompt-context.service';
import { finishAgentStream, type FinishAgentStreamDeps } from './finish-agent-stream';
import { createStreamingCallbacks } from './orchestrator-streaming-callbacks';
import { GemmaRouterService } from '../gemma-router/gemma-router.service';
import { LocalMcpService } from '../local-mcp/local-mcp.service';

export interface OutboundEvent {
  type: string;
  data: Record<string, unknown>;
}

@Injectable()
export class OrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly strategy: AgentStrategy;
  isAuthenticated = false;
  isProcessing = false;
  private readonly outbound$ = new Subject<OutboundEvent>();
  private cachedSystemPromptFromFile: string | null = null;
  private currentActivityId: string | null = null;
  private reasoningTextAccumulated = '';
  private lastStreamUsage: TokenUsage | undefined = undefined;
  /** Cached MCP tool list with descriptions, fetched once at startup. */
  private mcpToolsCache: Array<{ name: string; description: string }> | null = null;

  constructor(
    private readonly activityStore: ActivityStoreService,
    private readonly messageStore: MessageStoreService,
    private readonly modelStore: ModelStoreService,
    private readonly effortStore: EffortStoreService,
    private readonly config: ConfigService,
    private readonly strategyRegistry: StrategyRegistryService,
    private readonly uploadsService: UploadsService,
    private readonly fibeSync: FibeSyncService,
    private readonly chatPromptContext: ChatPromptContextService,
    private readonly gemmaRouter: GemmaRouterService,
    private readonly agentModeStore: AgentModeStoreService,
    private readonly localMcp: LocalMcpService,
  ) {
    this.strategy = this.strategyRegistry.resolveStrategy();
  }

  async onModuleInit(): Promise<void> {
    // Build the fibe-local entry here, where we already hold a reference to the
    // LocalMcpService and can use __dirname-based resolution without touching webpack.
    const localServerPath = this.localMcp.getServerScriptPath();
    writeMcpConfig({
      'fibe-local': {
        command: process.execPath,
        args: [localServerPath],
        env: {
          PORT: process.env['PORT'] ?? '3000',
          ...(process.env['AGENT_PASSWORD'] ? { AGENT_PASSWORD: process.env['AGENT_PASSWORD'] } : {}),
        },
      },
    });
    if (!this.config.getSystemPrompt()) {
      const builtinPath = join(process.cwd(), 'dist', 'assets', 'SYSTEM_PROMPT.md');
      if (existsSync(builtinPath)) {
        try {
          this.cachedSystemPromptFromFile = await readFile(builtinPath, 'utf8');
        } catch {
          this.logger.warn('Failed to read built-in system prompt file');
        }
      }
    }

    // Forward local MCP tool WS events (ask_user_prompt, confirm_action_prompt, etc.) to the chat UI
    this.localMcp.outbound$.subscribe((event) => {
      this._send(event.type, event.data);
    });

    // Register mode accessors so local tools can read/write the agent mode
    this.localMcp.registerModeAccessors(
      () => this.agentModeStore.get(),
      (mode) => this.setAgentMode(mode),
    );

    // Pre-fetch MCP tool descriptions for Gemma classification (non-blocking)
    if (this.config.isGemmaRouterEnabled()) {
      void this.fetchMcpToolDescriptions();
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

  get outbound(): Subject<OutboundEvent> {
    return this.outbound$;
  }

  get messages(): MessageStoreService {
    return this.messageStore;
  }

  private _send(type: string, data: Record<string, unknown> = {}): void {
    this.outbound$.next({ type, data });
  }

  private finishStreamDeps(): FinishAgentStreamDeps {
    return {
      messageStore: this.messageStore,
      modelStore: this.modelStore,
      activityStore: this.activityStore,
      fibeSync: this.fibeSync,
      send: (type: string, data?: Record<string, unknown>) =>
        this._send(type, data ?? {}),
      getCurrentActivityId: () => this.currentActivityId,
      clearLastStreamUsage: () => {
        this.lastStreamUsage = undefined;
      },
    };
  }

  private async flushStores(): Promise<void> {
    await Promise.all([
      this.messageStore.flush(),
      this.activityStore.flush(),
      this.modelStore.flush(),
      this.effortStore.flush(),
    ]);
  }

  ensureStrategySettings(): void {
    this.strategy.ensureSettings?.();
  }

  /**
   * Validate, persist, and broadcast a new agent mode.
   * Returns the resolved display string, or `null` when the mode is invalid.
   */
  setAgentMode(mode: string): AgentModeValue | null {
    const resolved = this.agentModeStore.set(mode);
    if (!resolved) return null;
    this._send(WS_EVENT.AGENT_MODE_UPDATED, { mode: resolved });
    return resolved;
  }


  async handleClientMessage(msg: {
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
    story?: Array<{ id: string; type: string; message: string; timestamp: string; details?: string }>;
  }): Promise<void> {
    const handlers: Record<string, () => Promise<void> | void> = {
      [WS_ACTION.CHECK_AUTH_STATUS]: () => this.checkAndSendAuthStatus(),
      [WS_ACTION.INITIATE_AUTH]: () => this.handleInitiateAuth(),
      [WS_ACTION.SUBMIT_AUTH_CODE]: () => this.handleSubmitAuthCode(msg.code ?? ''),
      [WS_ACTION.CANCEL_AUTH]: () => this.handleCancelAuth(),
      [WS_ACTION.REAUTHENTICATE]: () => this.handleReauthenticate(),
      [WS_ACTION.LOGOUT]: () => this.handleLogout(),
      [WS_ACTION.SEND_CHAT_MESSAGE]: async () => {
        if (this.isProcessing) {
          await this.handleQueueMessage(msg.text ?? '');
        } else {
          await this.handleChatMessage(
            msg.text ?? '',
            msg.images,
            msg.audio,
            msg.audioFilename,
            msg.attachmentFilenames
          );
        }
      },
      [WS_ACTION.QUEUE_MESSAGE]: () => this.handleQueueMessage(msg.text ?? ''),
      [WS_ACTION.SUBMIT_STORY]: () => this.handleSubmitStory(msg.story ?? []),
      [WS_ACTION.GET_MODEL]: () => this.handleGetModel(),
      [WS_ACTION.SET_MODEL]: () => this.handleSetModel(msg.model ?? ''),
      [WS_ACTION.GET_EFFORT]: () => this.handleGetEffort(),
      [WS_ACTION.SET_EFFORT]: () => this.handleSetEffort(msg.effort ?? ''),
      [WS_ACTION.INTERRUPT_AGENT]: () => {
        if (this.isProcessing) this.strategy.interruptAgent?.();
      },
      [WS_ACTION.SET_AGENT_MODE]: () => this.handleSetAgentMode(msg.mode ?? ''),
      [WS_ACTION.ANSWER_USER_QUESTION]: () =>
        this.handleAnswerUserQuestion(
          (msg as { questionId?: string; answer?: string }).questionId ?? '',
          (msg as { answer?: string }).answer ?? '',
        ),
      [WS_ACTION.CONFIRM_ACTION_RESPONSE]: () =>
        this.handleConfirmActionResponse(
          (msg as { questionId?: string; confirmed?: boolean }).questionId ?? '',
          !!(msg as { confirmed?: boolean }).confirmed,
        ),
      [WS_ACTION.RESET_CONVERSATION]: () => this.handleResetConversation(),
    };

    const handler = handlers[msg.action];
    if (handler) {
      await handler();
    } else {
      this.logger.warn(`Unknown action: ${msg.action}`);
    }
  }

  handleClientConnected(): void {
    this._send(WS_EVENT.AUTH_STATUS, {
      status: this.isAuthenticated ? AUTH_STATUS_VAL.AUTHENTICATED : AUTH_STATUS_VAL.UNAUTHENTICATED,
      isProcessing: this.isProcessing,
    });
    this._send(WS_EVENT.ACTIVITY_SNAPSHOT, {
      activity: this.activityStore.all(),
    });
    this._send(WS_EVENT.AGENT_MODE_UPDATED, { mode: this.agentModeStore.get() });
  }

  private async checkAndSendAuthStatus(): Promise<void> {
    this.isAuthenticated = await this.strategy.checkAuthStatus();
    this._send(WS_EVENT.AUTH_STATUS, {
      status: this.isAuthenticated ? AUTH_STATUS_VAL.AUTHENTICATED : AUTH_STATUS_VAL.UNAUTHENTICATED,
      isProcessing: this.isProcessing,
    });
  }

  private async handleInitiateAuth(): Promise<void> {
    const currentlyAuthenticated = await this.strategy.checkAuthStatus();
    if (currentlyAuthenticated) {
      this.isAuthenticated = true;
      this._send(WS_EVENT.AUTH_SUCCESS);
    } else {
      const connection = this.createAuthConnection();
      this.strategy.executeAuth(connection);
    }
  }

  private handleSubmitAuthCode(code: string): void {
    this.strategy.submitAuthCode(code);
  }

  private handleCancelAuth(): void {
    this.strategy.cancelAuth();
    this.isAuthenticated = false;
    this._send(WS_EVENT.AUTH_STATUS, {
      status: AUTH_STATUS_VAL.UNAUTHENTICATED,
      isProcessing: this.isProcessing,
    });
  }

  private async handleReauthenticate(): Promise<void> {
    this.strategy.cancelAuth();
    this.strategy.clearCredentials();
    this.isAuthenticated = false;
    this._send(WS_EVENT.AUTH_STATUS, {
      status: AUTH_STATUS_VAL.UNAUTHENTICATED,
      isProcessing: this.isProcessing,
    });
    const connection = this.createAuthConnection();
    this.strategy.executeAuth(connection);
  }

  private handleLogout(): void {
    this.strategy.cancelAuth();
    this.isAuthenticated = false;
    this.isProcessing = false;
    this._send(WS_EVENT.AUTH_STATUS, {
      status: AUTH_STATUS_VAL.UNAUTHENTICATED,
      isProcessing: false,
    });
    const connection = this.createLogoutConnection();
    this.strategy.executeLogout(connection);
  }

  async sendMessageFromApi(
    text: string,
    images?: string[],
    attachmentFilenames?: string[]
  ): Promise<{ accepted: boolean; messageId?: string; error?: string }> {
    await this.checkAndSendAuthStatus();
    if (!this.isAuthenticated) {
      return { accepted: false, error: ERROR_CODE.NEED_AUTH };
    }
    if (this.isProcessing) {
      return { accepted: false, error: ERROR_CODE.AGENT_BUSY };
    }
    this.isProcessing = true;
    // count$ handles QUEUE_UPDATED organically but this helps the API send immediately
    const { messageId, text: _text, imageUrls: urls, audioFilename: af, attachmentFilenames: att } =
      await this.addUserMessageAndEmit(text, images, undefined, undefined, attachmentFilenames);
    void this.runAgentResponse(_text, urls, af, att).catch((err) =>
      this.logger.warn('REST send-message agent run failed', err)
    );
    return { accepted: true, messageId };
  }

  private async addUserMessageAndEmit(
    text: string,
    images?: string[],
    audio?: string,
    audioFilenameFromClient?: string,
    attachmentFilenames?: string[]
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
          imageUrls.push(await this.uploadsService.saveImage(dataUrl));
        } catch {
          this.logger.warn('Failed to save one image, skipping');
        }
      }
    }
    let audioFilename: string | null = audioFilenameFromClient ?? null;
    if (!audioFilename && audio) {
      try {
        audioFilename = await this.uploadsService.saveAudio(audio);
      } catch {
        this.logger.warn('Failed to save voice recording, skipping');
      }
    }
    const userMessage = this.messageStore.add(
      'user',
      text,
      imageUrls.length ? imageUrls : undefined
    );
    await this.messageStore.flush();
    this._send(WS_EVENT.MESSAGE, userMessage as unknown as Record<string, unknown>);
    return {
      messageId: userMessage.id,
      text,
      imageUrls,
      audioFilename,
      attachmentFilenames,
    };
  }

  private async runAgentResponse(
    text: string,
    imageUrls: string[],
    audioFilename: string | null,
    attachmentFilenames?: string[]
  ): Promise<void> {
    let accumulated = '';
    const syntheticStepId = 'generating-response';
    const syntheticStep: ThinkingStep = {
      id: syntheticStepId,
      title: 'Generating response',
      status: 'processing',
      timestamp: new Date(),
    };
    try {
      let systemPrompt = '';
      const configSystemPrompt = this.config.getSystemPrompt();
      if (configSystemPrompt) {
        systemPrompt = configSystemPrompt;
      } else if (this.cachedSystemPromptFromFile !== null) {
        systemPrompt = this.cachedSystemPromptFromFile;
      }
      // Only inject prompt-level history for strategies without native session support.
      // Strategies like Claude Code use --resume which restores full context natively.
      const historyMessages = this.strategy.hasNativeSessionSupport?.()
        ? undefined
        : (() => {
            const allMessages = this.messageStore.all();
            return allMessages.length > 1
              ? allMessages.slice(0, -1).map((m) => ({ role: m.role, body: m.body }))
              : undefined;
          })();

      // Gemma pre-pass: classify user intent → inject MCP tool hints into the prompt.
      // Runs only when GEMMA_ROUTER_ENABLED=true and Ollama is reachable.
      // Stored chat history is never modified — only the built prompt changes.
      let routedText = text;
      if (this.config.isGemmaRouterEnabled()) {
        const mcpTools = this.getMcpTools();
        this.logger.log(`[GemmaRouter] input: "${text.slice(0, 80)}", tools: ${mcpTools.length}`);
        if (mcpTools.length) {
          const gemmaResult = await this.gemmaRouter.analyze(text, mcpTools);
          this.logger.log(`[GemmaRouter] result: ${JSON.stringify(gemmaResult)}`);
          if (!gemmaResult.skipped && gemmaResult.action) {
            const action = gemmaResult.action;
            if (action.type === 'EXECUTE_CLI') {
              await this.executeCliDirectly(action.command, syntheticStepId, syntheticStep);
              return; // Short-circuit Big LLM
            } else if (action.type === 'DELEGATE_TO_AGENT') {
              if (action.confidence >= this.config.getGemmaConfidenceThreshold()) {
                routedText = this.chatPromptContext.injectToolHint(text, action.tools, action.confidence);
                this.logger.log(`[GemmaRouter] injected hint — tools: [${action.tools.join(', ')}], confidence: ${Math.round(action.confidence * 100)}%`);
              } else {
                this.logger.log(`[GemmaRouter] no hint injected — confidence: ${action.confidence}`);
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
      routedText = this.chatPromptContext.injectModeHint(routedText, currentMode);

      const fullPrompt = await this.chatPromptContext.buildFullPrompt(
        routedText,
        imageUrls,
        audioFilename,
        attachmentFilenames,
        historyMessages,
      );
      const model = this.modelStore.get();
      const effort = this.effortStore.get();
      this._send(WS_EVENT.STREAM_START, { model });
      const streamStartEntry: StoredStoryEntry = {
        id: randomUUID(),
        type: 'stream_start',
        message: 'Response started',
        timestamp: new Date().toISOString(),
        details: model ? `Model: ${model}` : undefined,
      };
      const currentActivity = this.activityStore.createWithEntry(streamStartEntry);
      this.currentActivityId = currentActivity.id;
      this.reasoningTextAccumulated = '';
      this._send(WS_EVENT.ACTIVITY_APPENDED, { entry: currentActivity });
      this._send(WS_EVENT.THINKING_STEP, {
        id: syntheticStep.id,
        title: syntheticStep.title,
        status: syntheticStep.status,
        details: syntheticStep.details,
        timestamp: syntheticStep.timestamp.toISOString(),
      });
      this.lastStreamUsage = undefined;
      const streamDeps = {
        send: (type: string, data?: Record<string, unknown>) =>
          this._send(type, data ?? {}),
        activityStore: this.activityStore,
        getCurrentActivityId: () => this.currentActivityId,
        getReasoningText: () => this.reasoningTextAccumulated,
        appendReasoningText: (t: string) => {
          this.reasoningTextAccumulated += t;
        },
        clearReasoningText: () => {
          this.reasoningTextAccumulated = '';
        },
        setLastStreamUsage: (u: TokenUsage | undefined) => {
          this.lastStreamUsage = u;
        },
      };
      const callbacks = createStreamingCallbacks(streamDeps);
      await this.strategy.executePromptStreaming(fullPrompt, model, (chunk) => {
        accumulated += chunk;
        this._send(WS_EVENT.STREAM_CHUNK, { text: chunk });
      }, callbacks, systemPrompt || undefined, { effort });
      finishAgentStream(
        this.finishStreamDeps(),
        accumulated,
        syntheticStepId,
        syntheticStep,
        this.lastStreamUsage
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw === INTERRUPTED_MESSAGE) {
        finishAgentStream(
          this.finishStreamDeps(),
          accumulated,
          syntheticStepId,
          syntheticStep,
          this.lastStreamUsage
        );
      } else {
        const message = raw.length > 500 ? raw.slice(0, 500).trim() + '...' : raw;
        if (isProviderAuthFailureMessage(message)) {
          this.isAuthenticated = false;
        }
        this._send(WS_EVENT.ERROR, { message });
      }
    } finally {
      await this.flushStores();
      this.isProcessing = false;
    }
  }

  private async handleChatMessage(
    text: string,
    images?: string[],
    audio?: string,
    audioFilenameFromClient?: string,
    attachmentFilenames?: string[]
  ): Promise<void> {
    if (!this.isAuthenticated) {
      this._send(WS_EVENT.ERROR, { message: ERROR_CODE.NEED_AUTH });
      return;
    }
    this.isProcessing = true;
    // the count$ stream will emit QUEUE_UPDATED automatically, but doing it here ensures immediate UI feedback
    const { text: _t, imageUrls, audioFilename, attachmentFilenames: att } =
      await this.addUserMessageAndEmit(
        text,
        images,
        audio,
        audioFilenameFromClient,
        attachmentFilenames
      );
    await this.runAgentResponse(_t, imageUrls, audioFilename, att);
  }

  private async handleQueueMessage(text: string): Promise<void> {
    if (!text.trim()) return;
    const userMessage = this.messageStore.add('user', text);
    await this.messageStore.flush();
    this._send(WS_EVENT.MESSAGE, userMessage as unknown as Record<string, unknown>);
    void this.fibeSync.syncMessages(() => JSON.stringify(this.messageStore.all()));
    
    if (this.strategy.steerAgent) {
      this.strategy.steerAgent(text);
    }
  }

  private createAuthConnection(): AuthConnection {
    return {
      sendAuthUrlGenerated: (url) => this._send(WS_EVENT.AUTH_URL_GENERATED, { url }),
      sendDeviceCode: (code) => this._send(WS_EVENT.AUTH_DEVICE_CODE, { code }),
      sendAuthManualToken: () => this._send(WS_EVENT.AUTH_MANUAL_TOKEN),
      sendAuthSuccess: () => {
        this.isAuthenticated = true;
        this._send(WS_EVENT.AUTH_SUCCESS);
      },
      sendAuthStatus: (status) =>
        this._send(WS_EVENT.AUTH_STATUS, { status, isProcessing: this.isProcessing }),
      sendError: (message) => this._send(WS_EVENT.ERROR, { message }),
    };
  }

  private createLogoutConnection(): LogoutConnection {
    return {
      sendLogoutOutput: (text) => this._send(WS_EVENT.LOGOUT_OUTPUT, { text }),
      sendLogoutSuccess: () => {
        this.isAuthenticated = false;
        this._send(WS_EVENT.LOGOUT_SUCCESS);
      },
      sendError: (message) => this._send(WS_EVENT.ERROR, { message }),
    };
  }

  private async handleSubmitStory(story: StoredStoryEntry[]): Promise<void> {
    if (this.currentActivityId) {
      const entry = this.activityStore.getById(this.currentActivityId);
      const backendStory = entry?.story ?? [];
      const useClientStory = story.length > backendStory.length;
      const storyToUse = useClientStory ? story : backendStory;
      if (useClientStory && entry) {
        this.activityStore.replaceStory(this.currentActivityId, story);
      }
      this.messageStore.finalizeLastAssistant(storyToUse, this.currentActivityId);
      const finalEntry = this.activityStore.getById(this.currentActivityId);
      if (finalEntry) {
        this._send(WS_EVENT.ACTIVITY_UPDATED, { entry: finalEntry });
      }
      this.currentActivityId = null;
    } else {
      // If currentActivityId is null, this might be a duplicate submission from a second tab.
      // Instead of appending a new activity, we just update the last assistant message's story if it exists.
      this.logger.debug('Received submit_story but currentActivityId is null (possible duplicate from another tab).');
      const allMessages = this.messageStore.all();
      const lastMsg = allMessages[allMessages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
         const backendStory = lastMsg.story ?? [];
         const useClientStory = story.length > backendStory.length;
         if (useClientStory) {
            this.messageStore.finalizeLastAssistant(story, lastMsg.activityId);
            if (lastMsg.activityId) {
               this.activityStore.replaceStory(lastMsg.activityId, story);
            }
         }
      }
    }
    void this.fibeSync.syncMessages(() =>
      JSON.stringify(this.messageStore.all())
    );
    void this.fibeSync.syncActivity(() =>
      JSON.stringify(this.activityStore.all())
    );
    await Promise.all([
      this.messageStore.flush(),
      this.activityStore.flush(),
    ]);
  }

  private handleGetModel(): void {
    this._send(WS_EVENT.MODEL_UPDATED, { model: this.modelStore.get() });
  }

  private async handleSetModel(model: string): Promise<void> {
    const value = this.modelStore.set(model);
    await this.modelStore.flush();
    this._send(WS_EVENT.MODEL_UPDATED, { model: value });
  }

  private handleGetEffort(): void {
    this._send(WS_EVENT.EFFORT_UPDATED, { effort: this.effortStore.get() });
  }

  private async handleSetEffort(effort: string): Promise<void> {
    const value = this.effortStore.set(effort);
    await this.effortStore.flush();
    this._send(WS_EVENT.EFFORT_UPDATED, { effort: value });
  }

  private handleAnswerUserQuestion(questionId: string, answer: string): void {
    this.localMcp.resolveQuestion(questionId, { answer });
  }

  private handleConfirmActionResponse(questionId: string, confirmed: boolean): void {
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
  private async handleResetConversation(): Promise<void> {
    if (this.isProcessing) {
      this._send(WS_EVENT.ERROR, { message: 'Cannot reset while the agent is processing a request.' });
      return;
    }
    const resetAt = new Date().toISOString();
    this.messageStore.reset();
    this.activityStore.clear();
    await this.flushStores();
    this.logger.log(`Conversation reset at ${resetAt}`);
    this._send(WS_EVENT.CONVERSATION_RESET, { resetAt });
  }

  /**
   * Returns the list of configured MCP server/tool names from env vars.
   * These are the same names that writeMcpConfig() uses to register tools with the agent strategy.
   */
  /**
   * Returns MCP tool list with descriptions for Gemma classification.
   * Uses the cached list from fetchMcpToolDescriptions() if available,
   * falling back to plain server names from env vars.
   */
  private getMcpTools(): string[] | Array<{ name: string; description: string }> {
    if (this.mcpToolsCache && this.mcpToolsCache.length > 0) {
      return this.mcpToolsCache;
    }
    return this.getMcpToolNamesFromEnv();
  }

  /** Extracts plain MCP server names from MCP_CONFIG_JSON. */
  private getMcpToolNamesFromEnv(): Array<{ name: string; description: string }> {
    const sources = [process.env.MCP_CONFIG_JSON];
    const tools: Array<{ name: string; description: string }> = [];
    const names = new Set<string>();
    
    for (const raw of sources) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown>; serverUrl?: string };
        if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
          for (const name of Object.keys(parsed.mcpServers)) {
            names.add(name);
          }
        } else if (parsed.serverUrl) {
          names.add('fibe');
        }
      } catch {
        // Ignore parse errors — same tolerance as mcp-config-writer
      }
    }
    
    // For stdio servers (which fetchMcpToolDescriptions can't query), provide hardcoded fallbacks
    // so Gemma knows what they do.
    if (names.has('fibe')) {
      tools.push({ name: 'fibe_me', description: 'Returns current user profile and email' });
      tools.push({ name: 'fibe_agents_list', description: 'Lists all available agents' });
      tools.push({ name: 'fibe_playgrounds_get', description: 'Lists all playground environments' });
    } else {
      // If fibe isn't explicitly defined but we fallback, we can just map raw names
      for (const name of names) {
        tools.push({ name, description: `The ${name} MCP server` });
      }
    }
    
    if (names.has('github')) {
      tools.push({ name: 'github', description: 'GitHub operations: pull requests, issues, repos' });
    }
    
    return tools.length > 0 ? tools : Array.from(names).map(n => ({ name: n, description: n }));
  }

  /**
   * Fetches the full MCP tool list (with descriptions) from the configured MCP server
   * using the MCP JSON-RPC tools/list method. Results are cached in mcpToolsCache.
   * Runs non-blocking at startup; any failure falls back to plain env-var names.
   */
  private async fetchMcpToolDescriptions(): Promise<void> {
    // Extract server URLs from MCP config
    const urls = this.getMcpServerUrls();
    if (!urls.length) return;

    const allTools: Array<{ name: string; description: string }> = [];

    for (const serverUrl of urls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(serverUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json() as {
          result?: { tools?: Array<{ name: string; description?: string }> }
        };
        const tools = data?.result?.tools ?? [];
        for (const tool of tools) {
          if (tool.name) {
            allTools.push({ name: tool.name, description: tool.description ?? tool.name });
          }
        }
        this.logger.log(`GemmaRouter: fetched ${tools.length} MCP tool descriptions from ${serverUrl}`);
      } catch {
        this.logger.debug(`GemmaRouter: could not fetch tool list from ${serverUrl}`);
      }
    }

    if (allTools.length > 0) {
      this.mcpToolsCache = allTools;
    }
  }

  /** Extracts MCP server HTTP URLs (streamable-HTTP servers only). */
  private getMcpServerUrls(): string[] {
    const sources = [process.env.MCP_CONFIG_JSON];
    const urls: string[] = [];
    for (const raw of sources) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as {
          mcpServers?: Record<string, { serverUrl?: string }>;
          serverUrl?: string;
        };
        if (parsed.mcpServers) {
          for (const entry of Object.values(parsed.mcpServers)) {
            if (entry.serverUrl) urls.push(entry.serverUrl);
          }
        } else if (parsed.serverUrl) {
          urls.push(parsed.serverUrl);
        }
      } catch { /* ignore */ }
    }
    return urls;
  }
  
  private async executeCliDirectly(command: string, syntheticStepId: string, syntheticStep: ThinkingStep): Promise<void> {
    this.logger.log(`[GemmaRouter] executing CLI directly: ${command}`);
    const model = 'CLI Router';
    this._send(WS_EVENT.STREAM_START, { model });
    const streamStartEntry: StoredStoryEntry = {
      id: randomUUID(),
      type: 'stream_start',
      message: 'Response started',
      timestamp: new Date().toISOString(),
      details: `Model: ${model}`,
    };
    const currentActivity = this.activityStore.createWithEntry(streamStartEntry);
    this.currentActivityId = currentActivity.id;
    this._send(WS_EVENT.ACTIVITY_APPENDED, { entry: currentActivity });
    
    const execAsync = promisify(exec);
    let cliOut = `> ${command}\n\n`;
    this._send(WS_EVENT.STREAM_CHUNK, { text: cliOut });
    
    try {
      const envPath = `${process.env['DATA_DIR'] || '/app/data'}/.fibe/bin:/usr/local/bin:${process.env.PATH || ''}`;
      const { stdout, stderr } = await execAsync(command, { env: { ...process.env, PATH: envPath } });
      const output = stdout || stderr || 'Command executed successfully with no output.';
      cliOut += output;
      this._send(WS_EVENT.STREAM_CHUNK, { text: output });
    } catch (e) {
      const errText = e instanceof Error ? e.message : String(e);
      cliOut += `Error: ${errText}`;
      this._send(WS_EVENT.STREAM_CHUNK, { text: `Error: ${errText}` });
    }
    finishAgentStream(this.finishStreamDeps(), cliOut, syntheticStepId, syntheticStep, undefined);
  }
}
