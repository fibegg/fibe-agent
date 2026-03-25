import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Subject } from 'rxjs';
import { ConfigService } from '../config/config.service';
import { ActivityStoreService } from '../activity-store/activity-store.service';
import {
  MessageStoreService,
  type StoredStoryEntry,
} from '../message-store/message-store.service';
import { FibeSyncService } from '../fibe-sync/fibe-sync.service';

import { SteeringService } from '../steering/steering.service';
import { ModelStoreService } from '../model-store/model-store.service';
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

import { writeMcpConfig } from '../config/mcp-config-writer';

import { ChatPromptContextService } from './chat-prompt-context.service';
import { finishAgentStream, type FinishAgentStreamDeps } from './finish-agent-stream';
import { createStreamingCallbacks } from './orchestrator-streaming-callbacks';

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

  constructor(
    private readonly activityStore: ActivityStoreService,
    private readonly messageStore: MessageStoreService,
    private readonly modelStore: ModelStoreService,
    private readonly config: ConfigService,
    private readonly strategyRegistry: StrategyRegistryService,
    private readonly uploadsService: UploadsService,
    private readonly fibeSync: FibeSyncService,
    private readonly chatPromptContext: ChatPromptContextService,
    private readonly steering: SteeringService,
  ) {
    this.strategy = this.strategyRegistry.resolveStrategy();
  }

  async onModuleInit(): Promise<void> {
    writeMcpConfig();
    if (!this.config.getSystemPrompt()) {
      const path = this.config.getSystemPromptPath();
      if (existsSync(path)) {
        try {
          this.cachedSystemPromptFromFile = await readFile(path, 'utf8');
        } catch {
          this.logger.warn('Failed to read system prompt file');
        }
      }
    }

    // Subscribe to queue count variations from steering service
    this.steering.count$.subscribe((count) => {
      this._send(WS_EVENT.QUEUE_UPDATED, { count });
    });
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

  ensureStrategySettings(): void {
    this.strategy.ensureSettings?.();
  }


  async handleClientMessage(msg: {
    action: string;
    code?: string;
    text?: string;
    model?: string;
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
      [WS_ACTION.INTERRUPT_AGENT]: () => {
        if (this.isProcessing) this.strategy.interruptAgent?.();
      },
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
    this._send(WS_EVENT.QUEUE_UPDATED, { count: this.steering.count });
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
    await this.steering.resetQueue();
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
      const fullPrompt = await this.chatPromptContext.buildFullPrompt(
        text,
        imageUrls,
        audioFilename,
        attachmentFilenames
      );
      const model = this.modelStore.get();
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
      }, callbacks, systemPrompt || undefined);
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
        this._send(WS_EVENT.ERROR, { message });
      }
    } finally {
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
    await this.steering.resetQueue();
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
    await this.steering.enqueue(text);
    const userMessage = this.messageStore.add('user', text);
    this._send(WS_EVENT.MESSAGE, userMessage as unknown as Record<string, unknown>);
    void this.fibeSync.syncMessages(JSON.stringify(this.messageStore.all()));
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

  private handleSubmitStory(story: StoredStoryEntry[]): void {
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
      this.messageStore.finalizeLastAssistant(story);
      const entry = this.activityStore.append(story);
      this._send(WS_EVENT.ACTIVITY_APPENDED, { entry });
    }
    void this.fibeSync.syncMessages(
      JSON.stringify(this.messageStore.all())
    );
    void this.fibeSync.syncActivity(
      JSON.stringify(this.activityStore.all())
    );
  }

  private handleGetModel(): void {
    this._send(WS_EVENT.MODEL_UPDATED, { model: this.modelStore.get() });
  }

  private handleSetModel(model: string): void {
    const value = this.modelStore.set(model);
    this._send(WS_EVENT.MODEL_UPDATED, { model: value });
  }
}
