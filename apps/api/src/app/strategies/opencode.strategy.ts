import type { AuthConnection, LogoutConnection } from './strategy.types';
import type { AgentStrategy } from './strategy.types';

export class OpencodeStrategy implements AgentStrategy {
  executeAuth(_connection: AuthConnection): void {
    throw new Error('Opencode strategy is not implemented');
  }

  submitAuthCode(_code: string): void {
    /* stub */
  }

  cancelAuth(): void {
    /* stub */
  }

  clearCredentials(): void {
    /* stub */
  }

  executeLogout(_connection: LogoutConnection): void {
    throw new Error('Opencode strategy is not implemented');
  }

  checkAuthStatus(): Promise<boolean> {
    return Promise.resolve(false);
  }

  executePromptStreaming(
    _prompt: string,
    _model: string,
    _onChunk: (chunk: string) => void,
    _callbacks?: import('./strategy.types').StreamingCallbacks
  ): Promise<void> {
    return Promise.reject(new Error('Opencode strategy is not implemented'));
  }
}
