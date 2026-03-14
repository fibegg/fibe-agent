import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { Subject } from 'rxjs';
import { ConfigService } from '../config/config.service';
import { ActivityStoreService } from '../activity-store/activity-store.service';
import {
  MessageStoreService,
  type StoredStoryEntry,
} from '../message-store/message-store.service';
import { PlaygroundsService } from '../playgrounds/playgrounds.service';
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
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import {
  AUTH_STATUS as AUTH_STATUS_VAL,
  ERROR_CODE,
  WS_ACTION,
  WS_EVENT,
} from '../ws.constants';

import { writeMcpConfig } from '../config/mcp-config-writer';

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

  constructor(
    private readonly activityStore: ActivityStoreService,
    private readonly messageStore: MessageStoreService,
    private readonly modelStore: ModelStoreService,
    private readonly config: ConfigService,
    private readonly strategyRegistry: StrategyRegistryService,
    private readonly uploadsService: UploadsService,
    private readonly playgroundsService: PlaygroundsService
  ) {
    this.strategy = this.strategyRegistry.resolveStrategy();
  }

  async onModuleInit(): Promise<void> {
    writeMcpConfig();
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
        await this.handleChatMessage(msg.text ?? '', msg.images, msg.audio, msg.audioFilename);
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
      default:
        this.logger.warn(`Unknown action: ${action}`);
    }
  }

  handleClientConnected(): void {
    this._send(WS_EVENT.AUTH_STATUS, {
      status: this.isAuthenticated ? AUTH_STATUS_VAL.AUTHENTICATED : AUTH_STATUS_VAL.UNAUTHENTICATED,
      isProcessing: this.isProcessing,
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
    this.logger.log(WS_ACTION.INITIATE_AUTH);
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
    this.logger.log(WS_ACTION.SUBMIT_AUTH_CODE);
    this.strategy.submitAuthCode(code);
  }

  private handleCancelAuth(): void {
    this.logger.log(WS_ACTION.CANCEL_AUTH);
    this.strategy.cancelAuth();
    this.isAuthenticated = false;
    this._send(WS_EVENT.AUTH_STATUS, {
      status: AUTH_STATUS_VAL.UNAUTHENTICATED,
      isProcessing: this.isProcessing,
    });
  }

  private async handleReauthenticate(): Promise<void> {
    this.logger.log(WS_ACTION.REAUTHENTICATE);
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
    this.logger.log(WS_ACTION.LOGOUT);
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

  private async handleChatMessage(text: string, images?: string[], audio?: string, audioFilenameFromClient?: string): Promise<void> {
    if (!this.isAuthenticated) {
      this._send(WS_EVENT.ERROR, { message: ERROR_CODE.NEED_AUTH });
      return;
    }
    if (this.isProcessing) {
      this._send(WS_EVENT.ERROR, { message: ERROR_CODE.BLOCKED });
      return;
    }

    this.logger.log(WS_ACTION.SEND_CHAT_MESSAGE);
    this.isProcessing = true;

    const imageUrls: string[] = [];
    if (images?.length) {
      for (const dataUrl of images) {
        try {
          imageUrls.push(this.uploadsService.saveImage(dataUrl));
        } catch {
          this.logger.warn('Failed to save one image, skipping');
        }
      }
    }

    let audioFilename: string | null = audioFilenameFromClient ?? null;
    if (!audioFilename && audio) {
      try {
        audioFilename = this.uploadsService.saveAudio(audio);
      } catch {
        this.logger.warn('Failed to save voice recording, skipping');
      }
    }

    const userMessage = this.messageStore.add('user', text, imageUrls.length ? imageUrls : undefined);
    this._send(WS_EVENT.MESSAGE, userMessage as unknown as Record<string, unknown>);

    const systemPromptPath = this.config.getSystemPromptPath();
    let systemPrompt = '';
    if (existsSync(systemPromptPath)) {
      systemPrompt = readFileSync(systemPromptPath, 'utf8');
    }

    let imageContext = '';
    if (imageUrls.length) {
      const paths = imageUrls
        .map((f) => this.uploadsService.getPath(f))
        .filter((p): p is string => p !== null);
      imageContext = paths.length
        ? `\n\nThe user attached ${paths.length} image(s). Full paths (for reference):\n${paths.map((p) => `- ${p}`).join('\n')}\n\n`
        : '';
    }

    let voiceContext = '';
    if (audioFilename) {
      const path = this.uploadsService.getPath(audioFilename);
      voiceContext = path ? `\n\nThe user attached a voice recording. File path: ${path}\n\n` : '';
    }

    const atPathRegex = /@([^\s@]+)/g;
    const atPaths = [...new Set((text.match(atPathRegex) ?? []).map((m) => m.slice(1)))];
    let fileContext = '';
    if (atPaths.length) {
      const blocks: string[] = [];
      for (const relPath of atPaths) {
        try {
          const content = this.playgroundsService.getFileContent(relPath);
          blocks.push(`--- ${relPath} ---\n${content}\n---`);
        } catch {
          try {
            const files = this.playgroundsService.getFolderFileContents(relPath);
            for (const { path: p, content } of files) {
              blocks.push(`--- ${p} ---\n${content}\n---`);
            }
          } catch {
            this.logger.warn(`Playground file or folder not found: ${relPath}`);
          }
        }
      }
      if (blocks.length) {
        fileContext = `\n\nThe user referenced the following playground file(s)/folder(s). Contents:\n\n${blocks.join('\n\n')}\n\n`;
      }
    }

    const fullPrompt = `${systemPrompt}${fileContext}${imageContext}${voiceContext}\n${text}`.trim();
    const model = this.modelStore.get();

    const syntheticStepId = 'generating-response';
    const syntheticStep: ThinkingStep = {
      id: syntheticStepId,
      title: 'Generating response',
      status: 'processing',
      timestamp: new Date(),
    };
    this._send(WS_EVENT.STREAM_START, { model });
    this._send(WS_EVENT.THINKING_STEP, {
      id: syntheticStep.id,
      title: syntheticStep.title,
      status: syntheticStep.status,
      details: syntheticStep.details,
      timestamp: syntheticStep.timestamp.toISOString(),
    });

    const callbacks: StreamingCallbacks = {
      onReasoningStart: () => {
        this._send(WS_EVENT.REASONING_START, {});
      },
      onReasoningChunk: (reasoningText) => {
        this._send(WS_EVENT.REASONING_CHUNK, { text: reasoningText });
      },
      onReasoningEnd: () => {
        this._send(WS_EVENT.REASONING_END, {});
      },
      onStep: (step) => {
        this._send(WS_EVENT.THINKING_STEP, {
          id: step.id,
          title: step.title,
          status: step.status,
          details: step.details,
          timestamp: step.timestamp instanceof Date ? step.timestamp.toISOString() : step.timestamp,
        });
      },
      onTool: (event: ToolEvent) => {
        if (event.kind === 'file_created') {
          this._send(WS_EVENT.FILE_CREATED, {
            name: event.name,
            path: event.path,
            summary: event.summary,
          });
        } else {
          this._send(WS_EVENT.TOOL_CALL, {
            name: event.name,
            path: event.path,
            summary: event.summary,
            command: event.command,
          });
        }
      },
    };

    let accumulated = '';

    try {
      await this.strategy.executePromptStreaming(fullPrompt, model, (chunk) => {
        accumulated += chunk;
        this._send(WS_EVENT.STREAM_CHUNK, { text: chunk });
      }, callbacks);

      const finalText =
        accumulated || 'The agent produced no visible output.';
      this.messageStore.add('assistant', finalText);
      this._send(WS_EVENT.THINKING_STEP, {
        id: syntheticStepId,
        title: syntheticStep.title,
        status: 'complete',
        details: syntheticStep.details,
        timestamp: new Date().toISOString(),
      });
      this._send(WS_EVENT.STREAM_END, {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._send(WS_EVENT.ERROR, { message });
    } finally {
      this.isProcessing = false;
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

  private handleSubmitStory(story: StoredStoryEntry[]): void {
    this.messageStore.setStoryForLastAssistant(story);
    this.activityStore.append(story);
  }

  private handleGetModel(): void {
    this._send(WS_EVENT.MODEL_UPDATED, { model: this.modelStore.get() });
  }

  private handleSetModel(model: string): void {
    const value = this.modelStore.set(model);
    this._send(WS_EVENT.MODEL_UPDATED, { model: value });
  }
}
