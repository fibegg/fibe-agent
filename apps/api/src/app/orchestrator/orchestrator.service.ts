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
import { PhoenixSyncService } from '../phoenix-sync/phoenix-sync.service';
import { PlaygroundsService } from '../playgrounds/playgrounds.service';
import { SteeringService } from '../steering/steering.service';
import { ModelStoreService } from '../model-store/model-store.service';
import { UploadsService } from '../uploads/uploads.service';
import type {
  AgentStrategy,
  AuthConnection,
  LogoutConnection,
  StreamingCallbacks,
  ThinkingStep,
  ToolEvent,
} from '../strategies/strategy.types';
import { INTERRUPTED_MESSAGE } from '../strategies/strategy.types';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import {
  AUTH_STATUS as AUTH_STATUS_VAL,
  ERROR_CODE,
  WS_ACTION,
  WS_EVENT,
} from '../ws.constants';

import { writeMcpConfig } from '../config/mcp-config-writer';

import { ChatPromptContextService } from './chat-prompt-context.service';

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

  constructor(
    private readonly activityStore: ActivityStoreService,
    private readonly messageStore: MessageStoreService,
    private readonly modelStore: ModelStoreService,
    private readonly config: ConfigService,
    private readonly strategyRegistry: StrategyRegistryService,
    private readonly uploadsService: UploadsService,
    private readonly playgroundsService: PlaygroundsService,
    private readonly phoenixSync: PhoenixSyncService,
    private readonly chatPromptContext: ChatPromptContextService,
    private readonly steering: SteeringService,
  ) {
    this.strategy = this.strategyRegistry.resolveStrategy();
    void this.playgroundsService;
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

  private finishStream(
    accumulated: string,
    stepId: string,
    step: ThinkingStep
  ): void {
    const finalText = accumulated || 'The agent produced no visible output.';
    this.messageStore.add('assistant', finalText);
    void this.phoenixSync.syncMessages(JSON.stringify(this.messageStore.all()));
    this._send(WS_EVENT.THINKING_STEP, {
      id: stepId,
      title: step.title,
      status: 'complete',
      details: step.details,
      timestamp: new Date().toISOString(),
    });
    this._send(WS_EVENT.STREAM_END, {});
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
    const action = msg.action;

    switch (action) {
      case WS_ACTION.CHECK_AUTH_STATUS:
        await this.checkAndSendAuthStatus();
        break;
      case WS_ACTION.INITIATE_AUTH:
        await this.handleInitiateAuth();
        break;
      case WS_ACTION.SUBMIT_AUTH_CODE:
        this.handleSubmitAuthCode(msg.code ?? '');
        break;
      case WS_ACTION.CANCEL_AUTH:
        this.handleCancelAuth();
        break;
      case WS_ACTION.REAUTHENTICATE:
        await this.handleReauthenticate();
        break;
      case WS_ACTION.LOGOUT:
        this.handleLogout();
        break;
      case WS_ACTION.SEND_CHAT_MESSAGE:
        if (this.isProcessing) {
          this.handleQueueMessage(msg.text ?? '');
        } else {
          await this.handleChatMessage(
            msg.text ?? '',
            msg.images,
            msg.audio,
            msg.audioFilename,
            msg.attachmentFilenames
          );
        }
        break;
      case WS_ACTION.QUEUE_MESSAGE:
        this.handleQueueMessage(msg.text ?? '');
        break;
      case WS_ACTION.SUBMIT_STORY:
        this.handleSubmitStory(msg.story ?? []);
        break;
      case WS_ACTION.GET_MODEL:
        this.handleGetModel();
        break;
      case WS_ACTION.SET_MODEL:
        this.handleSetModel(msg.model ?? '');
        break;
      case WS_ACTION.INTERRUPT_AGENT:
        if (this.isProcessing) {
          this.strategy.interruptAgent?.();
        }
        break;
      default:
        this.logger.warn(`Unknown action: ${action}`);
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
    this.steering.resetQueue();
    this._send(WS_EVENT.QUEUE_UPDATED, { count: 0 });

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

    const userMessage = this.messageStore.add('user', text, imageUrls.length ? imageUrls : undefined);
    this._send(WS_EVENT.MESSAGE, userMessage as unknown as Record<string, unknown>);

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
      attachmentFilenames,
    );
    const model = this.modelStore.get();

    const syntheticStepId = 'generating-response';
    const syntheticStep: ThinkingStep = {
      id: syntheticStepId,
      title: 'Generating response',
      status: 'processing',
      timestamp: new Date(),
    };
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

    const callbacks = this.buildStreamingCallbacks();
    let accumulated = '';

    try {
      await this.strategy.executePromptStreaming(fullPrompt, model, (chunk) => {
        accumulated += chunk;
        this._send(WS_EVENT.STREAM_CHUNK, { text: chunk });
      }, callbacks, systemPrompt || undefined);
      this.finishStream(accumulated, syntheticStepId, syntheticStep);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw === INTERRUPTED_MESSAGE) {
        this.finishStream(accumulated, syntheticStepId, syntheticStep);
      } else {
        const message = raw.length > 500 ? raw.slice(0, 500).trim() + '...' : raw;
        this._send(WS_EVENT.ERROR, { message });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private buildStreamingCallbacks(): StreamingCallbacks {
    return {
      onReasoningStart: () => this._send(WS_EVENT.REASONING_START, {}),
      onReasoningChunk: (reasoningText) => {
        this.reasoningTextAccumulated += reasoningText;
        this._send(WS_EVENT.REASONING_CHUNK, { text: reasoningText });
      },
      onReasoningEnd: () => {
        this._send(WS_EVENT.REASONING_END, {});
        if (this.currentActivityId && this.reasoningTextAccumulated.trim()) {
          this.activityStore.appendEntry(this.currentActivityId, {
            id: randomUUID(),
            type: 'reasoning_start',
            message: 'Reasoning',
            timestamp: new Date().toISOString(),
            details: this.reasoningTextAccumulated.trim(),
          });
        }
        this.reasoningTextAccumulated = '';
      },
      onStep: (step) => {
        this._send(WS_EVENT.THINKING_STEP, {
          id: step.id,
          title: step.title,
          status: step.status,
          details: step.details,
          timestamp: step.timestamp instanceof Date ? step.timestamp.toISOString() : step.timestamp,
        });
        if (this.currentActivityId) {
          this.activityStore.appendEntry(this.currentActivityId, {
            id: step.id,
            type: 'step',
            message: step.title,
            timestamp: step.timestamp instanceof Date ? step.timestamp.toISOString() : String(step.timestamp),
            details: step.details,
          });
        }
      },
      onAuthRequired: (url) => {
        this._send(WS_EVENT.AUTH_URL_GENERATED, { url });
      },
      onTool: (event: ToolEvent) => {
        if (event.kind === 'file_created') {
          this._send(WS_EVENT.FILE_CREATED, {
            name: event.name,
            path: event.path,
            summary: event.summary,
          });
          if (this.currentActivityId) {
            this.activityStore.appendEntry(this.currentActivityId, {
              id: randomUUID(),
              type: 'file_created',
              message: event.summary ?? event.name,
              timestamp: new Date().toISOString(),
              path: event.path,
            });
          }
        } else {
          this._send(WS_EVENT.TOOL_CALL, {
            name: event.name,
            path: event.path,
            summary: event.summary,
            command: event.command,
            details: event.details,
          });
          if (this.currentActivityId) {
            this.activityStore.appendEntry(this.currentActivityId, {
              id: randomUUID(),
              type: 'tool_call',
              message: event.summary ?? event.name,
              timestamp: new Date().toISOString(),
              command: event.command,
              details: event.details,
            });
          }
        }
      },
    };
  }

  private handleQueueMessage(text: string): void {
    if (!text.trim()) return;
    this.steering.enqueue(text);
    const userMessage = this.messageStore.add('user', text);
    this._send(WS_EVENT.MESSAGE, userMessage as unknown as Record<string, unknown>);
    this._send(WS_EVENT.QUEUE_UPDATED, { count: this.steering.count });
    void this.phoenixSync.syncMessages(JSON.stringify(this.messageStore.all()));
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
      this.messageStore.setStoryForLastAssistant(storyToUse);
      this.messageStore.setActivityIdForLastAssistant(this.currentActivityId);
      const finalEntry = this.activityStore.getById(this.currentActivityId);
      if (finalEntry) {
        this._send(WS_EVENT.ACTIVITY_UPDATED, { entry: finalEntry });
      }
      this.currentActivityId = null;
    } else {
      this.messageStore.setStoryForLastAssistant(story);
      const entry = this.activityStore.append(story);
      this._send(WS_EVENT.ACTIVITY_APPENDED, { entry });
    }
    void this.phoenixSync.syncMessages(
      JSON.stringify(this.messageStore.all())
    );
    void this.phoenixSync.syncActivity(
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
