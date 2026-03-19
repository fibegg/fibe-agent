import { Logger } from '@nestjs/common';
import type { AuthConnection, LogoutConnection } from './strategy.types';
import type { ConversationDataDirProvider } from './strategy.types';
import { INTERRUPTED_MESSAGE, type AgentStrategy } from './strategy.types';

const MOCK_AUTH_DELAY_MS = 1000;
const MOCK_LOGOUT_DELAY_MS = 500;

export class MockStrategy implements AgentStrategy {
  private readonly logger = new Logger(MockStrategy.name);
  private streamCancel: (() => void) | null = null;

  constructor(_config?: ConversationDataDirProvider) {}

  executeAuth(connection: AuthConnection): void {
    this.logger.log('executeAuth: Mocking auth success in 1s');
    setTimeout(() => {
      connection.sendAuthSuccess();
    }, MOCK_AUTH_DELAY_MS);
  }

  submitAuthCode(code: string): void {
    this.logger.log(`submitAuthCode called with code: ${code}`);
  }

  cancelAuth(): void {
    /* no-op for mock */
  }

  clearCredentials(): void {
    this.logger.log('clearCredentials: Skipping credential deletion');
  }

  executeLogout(connection: LogoutConnection): void {
    this.logger.log('executeLogout: Mocking logout in 500ms');
    connection.sendLogoutOutput('Logging out (mock)...\n');
    setTimeout(() => {
      connection.sendLogoutSuccess();
    }, MOCK_LOGOUT_DELAY_MS);
  }

  checkAuthStatus(): Promise<boolean> {
    this.logger.log('checkAuthStatus: Returning true');
    return Promise.resolve(true);
  }

  listModels(): Promise<string[]> {
    return Promise.resolve(['mock-model-a', 'mock-model-b', 'mock-model-c']);
  }

  interruptAgent(): void {
    this.streamCancel?.();
  }

  executePromptStreaming(
    _prompt: string,
    _model: string,
    onChunk: (chunk: string) => void,
    callbacks?: import('./strategy.types').StreamingCallbacks,
    _systemPrompt?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutRef: { id: ReturnType<typeof setTimeout> | null } = { id: null };
      this.streamCancel = () => {
        this.streamCancel = null;
        if (timeoutRef.id !== null) clearTimeout(timeoutRef.id);
        reject(new Error(INTERRUPTED_MESSAGE));
      };
      callbacks?.onReasoningChunk?.('Considering the request...\n');
      callbacks?.onReasoningChunk?.('Preparing a helpful response.\n');
      callbacks?.onReasoningEnd?.();
      callbacks?.onTool?.({
        kind: 'file_created',
        name: 'example-output.ts',
        path: 'example-output.ts',
        summary: 'Sample file created by mock agent',
      });
      timeoutRef.id = setTimeout(() => {
        this.streamCancel = null;
        timeoutRef.id = null;
        const timestamp = new Date().toISOString();
        onChunk('[MOCKED RESPONSE] Hello! ');
        onChunk(`The current timestamp is ${timestamp}`);
        resolve();
      }, MOCK_AUTH_DELAY_MS);
    });
  }
}
