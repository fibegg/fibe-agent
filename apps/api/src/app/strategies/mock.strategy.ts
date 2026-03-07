import { Logger } from '@nestjs/common';
import type { AuthConnection, LogoutConnection } from './strategy.types';
import type { AgentStrategy } from './strategy.types';

export class MockStrategy implements AgentStrategy {
  private readonly logger = new Logger(MockStrategy.name);

  executeAuth(connection: AuthConnection): void {
    this.logger.log('executeAuth: Mocking auth success in 1s');
    setTimeout(() => {
      connection.sendAuthSuccess();
    }, 1000);
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
    }, 500);
  }

  checkAuthStatus(): Promise<boolean> {
    this.logger.log('checkAuthStatus: Returning true');
    return Promise.resolve(true);
  }

  executePromptStreaming(
    _prompt: string,
    _model: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const timestamp = new Date().toISOString();
        onChunk('[MOCKED RESPONSE] Hello! ');
        onChunk(`The current timestamp is ${timestamp}`);
        resolve();
      }, 1000);
    });
  }
}
