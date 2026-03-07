export interface AuthConnection {
  sendAuthUrlGenerated(url: string): void;
  sendDeviceCode(code: string): void;
  sendAuthManualToken(): void;
  sendAuthSuccess(): void;
  sendAuthStatus(status: string): void;
  sendError(message: string): void;
}

export interface LogoutConnection {
  sendLogoutOutput(text: string): void;
  sendLogoutSuccess(): void;
  sendError(message: string): void;
}

export interface AgentStrategy {
  executeAuth(connection: AuthConnection): void;
  submitAuthCode(code: string): void;
  cancelAuth(): void;
  clearCredentials(): void;
  executeLogout(connection: LogoutConnection): void;
  checkAuthStatus(): Promise<boolean>;
  getModelArgs?(model: string): string[];
  executePromptStreaming(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void
  ): Promise<void>;
}
