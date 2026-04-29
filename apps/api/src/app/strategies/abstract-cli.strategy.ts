import { Logger } from '@nestjs/common';
import type { ChildProcess } from 'node:child_process';
import type {
  AgentStrategy,
  AuthConnection,
  ConversationDataDirProvider,
  AgentRuntimeOptions,
  LogoutConnection,
  StreamingCallbacks,
} from './strategy.types';
import { getProxyEnv } from '../provider-traffic/types';

export abstract class AbstractCLIStrategy implements AgentStrategy {
  protected readonly logger: Logger;
  protected activeAuthProcess: ChildProcess | null = null;
  protected currentConnection: AuthConnection | null = null;
  protected authCancel: (() => void) | null = null;
  protected currentStreamProcess: ChildProcess | null = null;
  protected streamInterrupted = false;
  protected readonly useApiTokenMode: boolean;
  protected readonly conversationDataDir: ConversationDataDirProvider | undefined;

  constructor(
    loggerName: string,
    useApiTokenMode = false,
    conversationDataDir?: ConversationDataDirProvider
  ) {
    this.logger = new Logger(loggerName);
    this.useApiTokenMode = useApiTokenMode;
    this.conversationDataDir = conversationDataDir;
  }

  abstract getWorkingDir(): string;

  abstract executeAuth(connection: AuthConnection): void;

  abstract submitAuthCode(code: string): void;

  abstract clearCredentials(): void;

  abstract executeLogout(connection: LogoutConnection): void;

  abstract checkAuthStatus(): Promise<boolean>;

  abstract executePromptStreaming(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    systemPrompt?: string,
    runtimeOptions?: AgentRuntimeOptions
  ): Promise<void>;

  cancelAuth(): void {
    this.authCancel?.();
    this.authCancel = null;
    this.activeAuthProcess = null;
    this.currentConnection = null;
  }

  protected pendingSteerMessages: string[] = [];

  interruptAgent(): void {
    this.streamInterrupted = true;
    this.currentStreamProcess?.kill();
  }

  steerAgent(message: string): void {
    this.pendingSteerMessages.push(message);
    this.interruptAgent();
  }

  protected consumePendingMessages(): string | undefined {
    if (!this.pendingSteerMessages.length) return undefined;
    const prefix = this.pendingSteerMessages.join('\n\n');
    this.pendingSteerMessages = [];
    return prefix;
  }

  /**
   * Returns env vars that route the spawned CLI through the MITM proxy.
   * Returns an empty object when the proxy is not active.
   */
  protected getProxyEnv(): Record<string, string> {
    return getProxyEnv();
  }
}
