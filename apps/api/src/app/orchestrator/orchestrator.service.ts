import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { Subject } from 'rxjs';
import { ConfigService } from '../config/config.service';
import { MessageStoreService } from '../message-store/message-store.service';
import { ModelStoreService } from '../model-store/model-store.service';
import type { AgentStrategy } from '../strategies/strategy.types';
import type { AuthConnection, LogoutConnection } from '../strategies/strategy.types';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';

export interface OutboundEvent {
  type: string;
  data: Record<string, unknown>;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly strategy: AgentStrategy;
  isAuthenticated = false;
  isProcessing = false;
  private readonly outbound$ = new Subject<OutboundEvent>();

  constructor(
    private readonly messageStore: MessageStoreService,
    private readonly modelStore: ModelStoreService,
    private readonly config: ConfigService,
    private readonly strategyRegistry: StrategyRegistryService
  ) {
    this.strategy = this.strategyRegistry.resolveStrategy();
    this.initAuthStatus();
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
      this._send('auth_status', {
        status: this.isAuthenticated ? 'authenticated' : 'unauthenticated',
        isProcessing: this.isProcessing,
      });
    }
  }

  async handleClientMessage(msg: { action: string; code?: string; text?: string; model?: string }): Promise<void> {
    const action = msg.action;

    switch (action) {
      case 'check_auth_status':
        await this.checkAndSendAuthStatus();
        break;
      case 'initiate_auth':
        await this.handleInitiateAuth();
        break;
      case 'submit_auth_code':
        this.handleSubmitAuthCode(msg.code ?? '');
        break;
      case 'cancel_auth':
        this.handleCancelAuth();
        break;
      case 'reauthenticate':
        await this.handleReauthenticate();
        break;
      case 'logout':
        this.handleLogout();
        break;
      case 'send_chat_message':
        await this.handleChatMessage(msg.text ?? '');
        break;
      case 'get_model':
        this.handleGetModel();
        break;
      case 'set_model':
        this.handleSetModel(msg.model ?? '');
        break;
      default:
        this.logger.warn(`Unknown action: ${action}`);
    }
  }

  handleClientConnected(): void {
    this._send('auth_status', {
      status: this.isAuthenticated ? 'authenticated' : 'unauthenticated',
      isProcessing: this.isProcessing,
    });
  }

  private async checkAndSendAuthStatus(): Promise<void> {
    this.isAuthenticated = await this.strategy.checkAuthStatus();
    this._send('auth_status', {
      status: this.isAuthenticated ? 'authenticated' : 'unauthenticated',
      isProcessing: this.isProcessing,
    });
  }

  private async handleInitiateAuth(): Promise<void> {
    this.logger.log('initiate_auth');
    const currentlyAuthenticated = await this.strategy.checkAuthStatus();
    if (currentlyAuthenticated) {
      this.isAuthenticated = true;
      this._send('auth_success');
    } else {
      const connection = this.createAuthConnection();
      this.strategy.executeAuth(connection);
    }
  }

  private handleSubmitAuthCode(code: string): void {
    this.logger.log('submit_auth_code');
    this.strategy.submitAuthCode(code);
  }

  private handleCancelAuth(): void {
    this.logger.log('cancel_auth');
    this.strategy.cancelAuth();
    this.isAuthenticated = false;
    this._send('auth_status', { status: 'unauthenticated', isProcessing: this.isProcessing });
  }

  private async handleReauthenticate(): Promise<void> {
    this.logger.log('reauthenticate');
    this.strategy.cancelAuth();
    this.strategy.clearCredentials();
    this.isAuthenticated = false;
    this._send('auth_status', { status: 'unauthenticated', isProcessing: this.isProcessing });
    const connection = this.createAuthConnection();
    this.strategy.executeAuth(connection);
  }

  private handleLogout(): void {
    this.logger.log('logout');
    this.strategy.cancelAuth();
    this.isAuthenticated = false;
    this.isProcessing = false;
    this._send('auth_status', { status: 'unauthenticated', isProcessing: false });
    const connection = this.createLogoutConnection();
    this.strategy.executeLogout(connection);
  }

  private async handleChatMessage(text: string): Promise<void> {
    if (!this.isAuthenticated) {
      this._send('error', { message: 'NEED_AUTH' });
      return;
    }
    if (this.isProcessing) {
      this._send('error', { message: 'BLOCKED' });
      return;
    }

    this.logger.log('send_chat_message');
    this.isProcessing = true;

    const userMessage = this.messageStore.add('user', text);
    this._send('message', userMessage as unknown as Record<string, unknown>);

    const systemPromptPath = this.config.getSystemPromptPath();
    let systemPrompt = '';
    if (existsSync(systemPromptPath)) {
      systemPrompt = readFileSync(systemPromptPath, 'utf8');
    }
    const fullPrompt = `${systemPrompt}\n\n${text}`.trim();
    const model = this.modelStore.get();

    let accumulated = '';
    this._send('stream_start', {});

    try {
      await this.strategy.executePromptStreaming(fullPrompt, model, (chunk) => {
        accumulated += chunk;
        this._send('stream_chunk', { text: chunk });
      });

      const finalText =
        accumulated || 'Process completed successfully but returned no output.';
      this.messageStore.add('assistant', finalText);
      this._send('stream_end', {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._send('error', { message });
    } finally {
      this.isProcessing = false;
    }
  }

  private createAuthConnection(): AuthConnection {
    return {
      sendAuthUrlGenerated: (url) => this._send('auth_url_generated', { url }),
      sendDeviceCode: (code) => this._send('auth_device_code', { code }),
      sendAuthManualToken: () => this._send('auth_manual_token'),
      sendAuthSuccess: () => {
        this.isAuthenticated = true;
        this._send('auth_success');
      },
      sendAuthStatus: (status) =>
        this._send('auth_status', { status, isProcessing: this.isProcessing }),
      sendError: (message) => this._send('error', { message }),
    };
  }

  private createLogoutConnection(): LogoutConnection {
    return {
      sendLogoutOutput: (text) => this._send('logout_output', { text }),
      sendLogoutSuccess: () => {
        this.isAuthenticated = false;
        this._send('logout_success');
      },
      sendError: (message) => this._send('error', { message }),
    };
  }

  private handleGetModel(): void {
    this._send('model_updated', { model: this.modelStore.get() });
  }

  private handleSetModel(model: string): void {
    const value = this.modelStore.set(model);
    this._send('model_updated', { model: value });
  }
}
