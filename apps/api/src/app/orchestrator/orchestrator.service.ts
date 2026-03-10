import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { Subject } from 'rxjs';
import { ConfigService } from '../config/config.service';
import { MessageStoreService } from '../message-store/message-store.service';
import { ModelStoreService } from '../model-store/model-store.service';
import { UploadsService } from '../uploads/uploads.service';
import type { AgentStrategy } from '../strategies/strategy.types';
import type { AuthConnection, LogoutConnection } from '../strategies/strategy.types';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import {
  AUTH_STATUS as AUTH_STATUS_VAL,
  ERROR_CODE,
  WS_ACTION,
  WS_EVENT,
} from '../ws.constants';

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
    private readonly messageStore: MessageStoreService,
    private readonly modelStore: ModelStoreService,
    private readonly config: ConfigService,
    private readonly strategyRegistry: StrategyRegistryService,
    private readonly uploadsService: UploadsService
  ) {
    this.strategy = this.strategyRegistry.resolveStrategy();
  }

  async onModuleInit(): Promise<void> {
    await this.initAuthStatus();
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

  private async initAuthStatus(): Promise<void> {
    const previousState = this.isAuthenticated;
    this.isAuthenticated = await this.strategy.checkAuthStatus();
    if (this.isAuthenticated !== previousState) {
      this._send(WS_EVENT.AUTH_STATUS, {
        status: this.isAuthenticated ? AUTH_STATUS_VAL.AUTHENTICATED : AUTH_STATUS_VAL.UNAUTHENTICATED,
        isProcessing: this.isProcessing,
      });
    }
  }

  async handleClientMessage(msg: {
    action: string;
    code?: string;
    text?: string;
    model?: string;
    images?: string[];
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
        await this.handleChatMessage(msg.text ?? '', msg.images);
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

  private async handleChatMessage(text: string, images?: string[]): Promise<void> {
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
    const fullPrompt = `${systemPrompt}${imageContext}\n${text}`.trim();
    const model = this.modelStore.get();

    let accumulated = '';
    this._send(WS_EVENT.STREAM_START, {});

    try {
      await this.strategy.executePromptStreaming(fullPrompt, model, (chunk) => {
        accumulated += chunk;
        this._send(WS_EVENT.STREAM_CHUNK, { text: chunk });
      });

      const finalText =
        accumulated || 'Process completed successfully but returned no output.';
      this.messageStore.add('assistant', finalText);
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

  private handleGetModel(): void {
    this._send(WS_EVENT.MODEL_UPDATED, { model: this.modelStore.get() });
  }

  private handleSetModel(model: string): void {
    const value = this.modelStore.set(model);
    this._send(WS_EVENT.MODEL_UPDATED, { model: value });
  }
}
