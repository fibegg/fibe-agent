import { Logger } from '@nestjs/common';
import type { ChildProcess } from 'node:child_process';
import type {
  AgentStrategy,
  AuthConnection,
  ConversationDataDirProvider,
  AgentRuntimeOptions,
  LogoutConnection,
  SteerAgentResult,
  StreamingCallbacks,
} from './strategy.types';
import { getProxyEnv } from '../provider-traffic/types';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*[a-zA-Z]/g;

export abstract class AbstractCLIStrategy implements AgentStrategy {
  protected readonly logger: Logger;
  protected activeAuthProcess: ChildProcess | null = null;
  protected currentConnection: AuthConnection | null = null;
  protected authCancel: (() => void) | null = null;
  protected currentStreamProcess: ChildProcess | null = null;
  protected streamInterrupted = false;
  protected readonly useApiTokenMode: boolean;
  protected readonly conversationDataDir: ConversationDataDirProvider | undefined;

  // ── Shared helpers promoted from concrete strategies ──────────────────────

  /**
   * Patterns that indicate a stored session ID is no longer valid on the
   * provider side. When matched, the local session marker should be cleared.
   */
  protected static readonly MISSING_SESSION_PATTERNS: RegExp[] = [
    /No conversation found with session ID:/i,
    /\b(conversation|session)\b[^\n]*\b(not found|missing)\b/i,
    /\b(failed|unable)\b[^\n]*\b(resume|continue)\b/i,
  ];

  /** Returns `true` when `message` looks like a missing/expired session error. */
  protected missingSessionError(message: string): boolean {
    return AbstractCLIStrategy.MISSING_SESSION_PATTERNS.some((p) => p.test(message));
  }

  /** Strip ANSI escape sequences so sidebar output is clean. */
  protected stripAnsi(s: string): string {
    return s.replace(ANSI_RE, '');
  }

  /**
   * Prepend pending steer messages to `prompt` as an `[Operator Interruption]`
   * block, and optionally prefix the system prompt.
   */
  protected buildPromptWithPending(prompt: string, systemPrompt?: string): string {
    const pending = this.consumePendingMessages();
    let final = pending ? `[Operator Interruption]\n${pending}\n\n${prompt}` : prompt;
    if (systemPrompt) final = `${systemPrompt}\n${final}`;
    return final;
  }

  // ─────────────────────────────────────────────────────────────────────────

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

  steerAgent(message: string): SteerAgentResult | Promise<SteerAgentResult> {
    this.pendingSteerMessages.push(message);
    this.interruptAgent();
    return 'queued';
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
    return getProxyEnv(this.conversationDataDir?.getConversationId?.());
  }
}
