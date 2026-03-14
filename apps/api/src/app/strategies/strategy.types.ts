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

export type ThinkingStepStatus = 'pending' | 'processing' | 'complete';

export interface ThinkingStep {
  id: string;
  title: string;
  status: ThinkingStepStatus;
  details?: string;
  timestamp: Date;
}

export interface ToolEvent {
  kind: 'file_created' | 'tool_call';
  name: string;
  path?: string;
  summary?: string;
}

export interface StreamingCallbacks {
  onReasoningStart?: () => void;
  onReasoningChunk?: (text: string) => void;
  onReasoningEnd?: () => void;
  onStep?: (step: ThinkingStep) => void;
  onTool?: (event: ToolEvent) => void;
}

export interface AgentStrategy {
  ensureSettings?(): void;
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
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks
  ): Promise<void>;
}
