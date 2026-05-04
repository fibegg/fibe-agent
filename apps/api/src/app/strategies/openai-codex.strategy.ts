import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectProviderAuthFailure } from '@shared/provider-auth-errors';
import type {
  AuthConnection,
  AgentRuntimeOptions,
  ConversationDataDirProvider,
  LogoutConnection,
  StreamingCallbacks,
  TokenUsage,
  ToolEvent,
} from './strategy.types';
import { INTERRUPTED_MESSAGE } from './strategy.types';
import { AbstractCLIStrategy } from './abstract-cli.strategy';
import { runAuthProcess } from './auth-process-helper';
import { buildProviderArgs, type ProviderArgsConfig } from './provider-args';
import { JsonLineRpcProcess, type JsonLineRpcMessage } from './json-line-rpc-process';
import { ProviderConversationPaths } from './provider-conversation-paths';

const DEFAULT_CODEX_HOME = join(process.env.HOME ?? '/home/node', '.codex');

const CODEX_WORKSPACE_SUBDIR = 'codex_workspace';
const SESSION_MARKER_FILE = '.codex_session';
const CODEX_BIN_NAME = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const RESPONSE_PREVIEW_MAX = 200;
const CODEX_APP_SERVER_REQUEST_TIMEOUT_MS = 120_000;
const CODEX_APP_SERVER_TURN_TIMEOUT_MS = 60 * 60 * 1000;
const MISSING_SESSION_ERROR_PATTERNS = [
  /No conversation found with session ID:/i,
  /\b(conversation|session)\b[^\n]*\b(not found|missing)\b/i,
  /\b(failed|unable)\b[^\n]*\b(resume|continue)\b/i,
];

const CODEX_PROVIDER_ARGS_CONFIG: ProviderArgsConfig = {
  defaultArgs: {
    '--color': 'never',
  },
  blockedArgs: {
    // Critical: non-interactive mode, always enforced
    '--dangerously-bypass-approvals-and-sandbox': true,
    // Output format, always enforced
    '--json': true,
    // Color must stay never for structured parsing
    '--color': 'never',
  },
};

const CODEX_REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);

function getCodexHome(): string {
  return process.env.CODEX_HOME ?? process.env.SESSION_DIR ?? DEFAULT_CODEX_HOME;
}

function getCodexCommand(): string {
  if (process.env.CODEX_BIN?.trim()) return process.env.CODEX_BIN.trim();

  try {
    const pkgPath = require.resolve('@openai/codex/package.json');
    const nodeModules = join(pkgPath, '..', '..', '..');
    const binPath = join(nodeModules, '.bin', CODEX_BIN_NAME);
    if (existsSync(binPath)) return binPath;
    const binPathUnix = join(nodeModules, '.bin', 'codex');
    if (existsSync(binPathUnix)) return binPathUnix;
  } catch {
    /* @openai/codex not installed */
  }
  const cwd = process.cwd();
  const localBin = join(cwd, 'node_modules', '.bin', CODEX_BIN_NAME);
  if (existsSync(localBin)) return localBin;
  const localBinUnix = join(cwd, 'node_modules', '.bin', 'codex');
  if (existsSync(localBinUnix)) return localBinUnix;
  return 'codex';
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*[a-zA-Z]/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, '');

function missingSessionError(message: string): boolean {
  return MISSING_SESSION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function useAppServerTransport(): boolean {
  const explicitTransport = (process.env.CODEX_AGENT_TRANSPORT ?? '').trim().toLowerCase();
  if (explicitTransport === 'exec' || explicitTransport === 'cli') return false;
  if (explicitTransport === 'app-server' || explicitTransport === 'appserver') return true;

  const explicitFlag = (process.env.CODEX_USE_APP_SERVER ?? '').trim().toLowerCase();
  if (['0', 'false', 'no'].includes(explicitFlag)) return false;
  return true;
}

function normalizeEffort(effort?: string): string | null {
  if (!effort) return null;
  return CODEX_REASONING_EFFORTS.has(effort) ? effort : null;
}

function codexUserInput(text: string): Array<{ type: 'text'; text: string; text_elements: [] }> {
  return [{ type: 'text', text, text_elements: [] }];
}

/* ------------------------------------------------------------------ */
/*  Structured JSONL parser for `codex exec --json`                   */
/* ------------------------------------------------------------------ */

interface CodexJsonEvent {
  type?: string;
  message?: string;
  thread_id?: string;
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
  item?: {
    id?: string;
    type?: string;
    text?: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number | null;
    status?: string;
    changes?: Array<{ path?: string; kind?: string }>;
    name?: string;
    summary?: string;
    path?: string;
  };
}

export interface CodexExecJsonState {
  errorResult: string;
  inReasoning: boolean;
  hasEmittedOutput: boolean;
}

export interface CodexExecJsonHandlers {
  onChunk: (chunk: string) => void;
  onReasoningStart?: () => void;
  onReasoningChunk?: (text: string) => void;
  onReasoningEnd?: () => void;
  onTool?: (event: ToolEvent) => void;
  onUsage?: (usage: TokenUsage) => void;
  onThreadId?: (threadId: string) => void;
}

interface CodexThread {
  id: string;
}

interface CodexThreadResponse {
  thread: CodexThread;
}

interface CodexTurnResponse {
  turn: {
    id: string;
    status?: string;
    error?: { message?: string } | null;
  };
}

interface CodexAppServerTurnState {
  threadId: string;
  turnId: string;
  onChunk: (chunk: string) => void;
  callbacks?: StreamingCallbacks;
  resolve: () => void;
  reject: (error: Error) => void;
  errorResult: string;
  reasoningOpen: boolean;
  hasVisibleOutput: boolean;
  completed: boolean;
  assistantTextByItemId: Map<string, string>;
}

interface CodexThreadItem {
  id?: string;
  type?: string;
  text?: string;
  command?: string;
  aggregatedOutput?: string | null;
  changes?: Array<{ path?: string; kind?: string; type?: string }>;
  server?: string;
  tool?: string;
  namespace?: string | null;
  arguments?: unknown;
  status?: string;
  error?: unknown;
  result?: unknown;
  summary?: string[];
  content?: string[];
}

/**
 * Parse a single JSONL line from `codex exec --json` and route into callbacks.
 *
 * Event flow:
 *   turn.started        → onReasoningStart  (opens activity entry)
 *   item: reasoning     → onReasoningChunk
 *   item: agent_message → onReasoningChunk (preview) + onReasoningEnd + onChunk
 *   item: command_exec  → onReasoningChunk + onTool
 *   item: file_change   → onReasoningChunk + onTool
 *   thread.started      → onThreadId
 *   turn.completed      → onReasoningEnd + onUsage
 *   error / turn.failed → onChunk (prefixed with ⚠️)
 *   non-JSON            → onChunk (ANSI stripped)
 */
export function handleCodexExecJsonLine(
  line: string,
  state: CodexExecJsonState,
  handlers: CodexExecJsonHandlers
): void {
  line = line.trim();
  if (!line) return;

  const startReasoning = () => {
    if (state.inReasoning) return;
    state.inReasoning = true;
    handlers.onReasoningStart?.();
  };

  const endReasoning = () => {
    if (!state.inReasoning) return;
    handlers.onReasoningEnd?.();
    state.inReasoning = false;
  };

  try {
    const event = JSON.parse(line) as CodexJsonEvent;
    const type = event.type ?? '';

    if (type === 'thread.started') {
      if (event.thread_id) handlers.onThreadId?.(event.thread_id);
      return;
    }

    if (type === 'turn.started') {
      startReasoning();
      return;
    }

    if (type.startsWith('item.') && event.item) {
      const item = event.item;

      switch (item.type) {
        case 'agent_message':
        case 'message': {
          if (!item.text) break;
          const preview = item.text.length > RESPONSE_PREVIEW_MAX
            ? item.text.slice(0, RESPONSE_PREVIEW_MAX) + '…'
            : item.text;
          state.hasEmittedOutput = true;
          handlers.onReasoningChunk?.(preview);
          endReasoning();
          handlers.onChunk(item.text);
          break;
        }

        case 'reasoning': {
          startReasoning();
          if (item.text) {
            state.hasEmittedOutput = true;
            handlers.onReasoningChunk?.(item.text);
          }
          break;
        }

        case 'command_execution': {
          if (!item.command) break;
          state.hasEmittedOutput = true;
          handlers.onReasoningChunk?.(`$ ${item.command}\n`);
          handlers.onTool?.({
            kind: 'tool_call',
            name: 'command',
            command: item.command,
            summary: item.aggregated_output?.slice(0, RESPONSE_PREVIEW_MAX),
            details: JSON.stringify({ command: item.command, output: item.aggregated_output }),
          });
          break;
        }

        case 'file_change': {
          for (const change of item.changes ?? []) {
            if (!change.path) continue;
            state.hasEmittedOutput = true;
            const fileName = change.path.split(/[/\\]/).pop() ?? 'file';
            handlers.onReasoningChunk?.(`${change.kind ?? 'changed'}: ${change.path}\n`);
            handlers.onTool?.({
              kind: 'file_created',
              name: fileName,
              path: change.path,
              summary: change.kind,
              details: JSON.stringify(change),
            });
          }
          break;
        }

        case 'local_shell_call':
        case 'function_call':
        case 'tool_call': {
          state.hasEmittedOutput = true;
          handlers.onTool?.({
            kind: 'tool_call',
            name: item.name ?? 'tool',
            command: item.command,
            path: item.path,
            summary: item.summary,
            details: JSON.stringify(item),
          });
          break;
        }

        default:
          break;
      }
      return;
    }

    if (type === 'turn.completed') {
      endReasoning();
      if (event.usage && handlers.onUsage) {
        handlers.onUsage({
          inputTokens: event.usage.input_tokens ?? 0,
          outputTokens: event.usage.output_tokens ?? 0,
        });
      }
      return;
    }

    if (type === 'turn.failed') {
      endReasoning();
      const msg = event.error?.message ?? 'Turn failed';
      state.errorResult += msg;
      handlers.onChunk(`⚠️ ${msg}`);
      return;
    }

    if (type === 'error') {
      const msg = event.message ?? event.error?.message ?? 'Unknown codex error';
      state.errorResult += msg;
      handlers.onChunk(`⚠️ ${msg}`);
      return;
    }
  } catch {
    const cleaned = stripAnsi(line).trim();
    if (cleaned) {
      state.hasEmittedOutput = true;
      handlers.onChunk(cleaned);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Strategy class                                                     */
/* ------------------------------------------------------------------ */

export class OpenaiCodexStrategy extends AbstractCLIStrategy {
  private readonly paths: ProviderConversationPaths;
  private appServer: JsonLineRpcProcess | null = null;
  private appServerTurn: CodexAppServerTurnState | null = null;
  private pendingAppServerNotifications: JsonLineRpcMessage[] = [];
  private activeAppServerThreadId: string | null = null;
  private activeAppServerTurnId: string | null = null;

  constructor(useApiTokenMode = false, conversationDataDir?: ConversationDataDirProvider) {
    super(OpenaiCodexStrategy.name, useApiTokenMode, conversationDataDir);
    this.paths = new ProviderConversationPaths({
      conversationDataDir,
      workspaceSubdir: CODEX_WORKSPACE_SUBDIR,
      fallbackWorkspaceDir: join(process.cwd(), CODEX_WORKSPACE_SUBDIR),
      sessionMarkerFile: SESSION_MARKER_FILE,
    });
  }

  private getCodexHomeForSession(): string {
    return getCodexHome();
  }

  private readSessionId(): string | null {
    return this.paths.readSessionMarker();
  }

  private writeSessionId(sessionId: string): void {
    this.paths.writeSessionMarker(sessionId);
  }

  private clearSessionId(): void {
    this.paths.clearSessionMarker();
  }

  getWorkingDir(): string {
    return this.paths.getWorkspaceDir();
  }

  prepareWorkingDir(): void {
    this.paths.prepareWorkspace();
  }

  getModelArgs(model: string): string[] {
    if (!model || model === 'undefined') return [];
    return ['-m', model];
  }

  private buildExecArgs(prompt: string, model: string, sessionId: string | null): string[] {
    const modelArgs = this.getModelArgs(model);
    const providerTokens = buildProviderArgs(CODEX_PROVIDER_ARGS_CONFIG);
    if (sessionId) {
      return [
        'exec',
        'resume',
        ...modelArgs,
        ...providerTokens,
        sessionId,
        '--',
        prompt,
      ];
    }
    return [
      'exec',
      ...modelArgs,
      ...providerTokens,
      '--',
      prompt,
    ];
  }

  hasNativeSessionSupport(): boolean {
    return this.readSessionId() !== null;
  }

  ensureSettings(): void {
    const codexHome = this.getCodexHomeForSession();
    if (!existsSync(codexHome)) {
      mkdirSync(codexHome, { recursive: true });
    }
    if (this.useApiTokenMode) {
      const key = process.env[OPENAI_API_KEY_ENV]?.trim();
      const authPath = join(codexHome, 'auth.json');
      if (key && !existsSync(authPath)) {
        writeFileSync(authPath, JSON.stringify({ api_key: key }), { mode: 0o600 });
      }
    }
  }

  executeAuth(connection: AuthConnection): void {
    this.currentConnection = connection;
    if (this.useApiTokenMode && process.env[OPENAI_API_KEY_ENV]?.trim()) {
      this.currentConnection.sendAuthSuccess();
      return;
    }
    this.ensureSettings();
    connection.sendAuthUrlGenerated('https://auth.openai.com/device');

    let authUrlExtracted = false;
    let deviceCodeExtracted = false;
    const codexHome = this.getCodexHomeForSession();
    const env = { ...process.env, CODEX_HOME: codexHome };

    const codexCmd = getCodexCommand();
    const { process: proc, cancel } = runAuthProcess(codexCmd, ['login', '--device-auth'], {
      env,
      onData: (output) => {
        // eslint-disable-next-line no-control-regex -- strip ANSI escape codes
        const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
        const urlMatch = clean.match(/https:\/\/[^\s"'> ]+/);
        if (urlMatch && !authUrlExtracted) {
          authUrlExtracted = true;
          this.currentConnection?.sendAuthUrlGenerated(urlMatch[0]);
        }
        const codeMatch = clean.match(/\b([A-Z0-9]{3,5}-[A-Z0-9]{3,5})\b/);
        if (codeMatch && !deviceCodeExtracted) {
          deviceCodeExtracted = true;
          this.currentConnection?.sendDeviceCode(codeMatch[1]);
        }
      },
      onClose: (code) => {
        if (this.currentConnection) {
          if (code === 0) {
            this.currentConnection.sendAuthSuccess();
          } else {
            this.currentConnection.sendAuthStatus('unauthenticated');
          }
        }
        this.activeAuthProcess = null;
        this.currentConnection = null;
      },
      onError: (err) => {
        this.activeAuthProcess = null;
        this.authCancel = null;
        const isNotFound = (err as NodeJS.ErrnoException)?.code === 'ENOENT';
        if (isNotFound) {
          this.logger.warn('Codex CLI not found. Install @openai/codex or add codex to PATH.');
          this.currentConnection?.sendError('Codex CLI not found. Install the app dependency or add codex to PATH.');
        } else {
          this.logger.error('Codex Auth Process error', err);
        }
      },
    });

    this.activeAuthProcess = proc;
    this.authCancel = cancel;
  }



  submitAuthCode(code: string): void {
    const trimmed = (code ?? '').trim();
    if (!trimmed) return;
    if (this.activeAuthProcess?.stdin) {
      this.activeAuthProcess.stdin.write(trimmed + '\n');
    }
  }

  clearCredentials(): void {
    const authFile = join(this.getCodexHomeForSession(), 'auth.json');
    if (existsSync(authFile)) unlinkSync(authFile);
  }

  executeLogout(connection: LogoutConnection): void {
    const env = { ...process.env, CODEX_HOME: this.getCodexHomeForSession() };
    const logoutProcess = spawn(getCodexCommand(), ['logout'], { env, shell: false });

    const handleOutput = (data: Buffer | string) => connection.sendLogoutOutput(data.toString());
    logoutProcess.stdout?.on('data', handleOutput);
    logoutProcess.stderr?.on('data', handleOutput);

    logoutProcess.on('close', () => {
      this.clearCredentials();
      connection.sendLogoutSuccess();
    });

    logoutProcess.on('error', () => {
      this.clearCredentials();
      connection.sendLogoutSuccess();
    });
  }

  checkAuthStatus(): Promise<boolean> {
    if (this.useApiTokenMode && process.env[OPENAI_API_KEY_ENV]?.trim()) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const authFile = join(this.getCodexHomeForSession(), 'auth.json');
      if (!existsSync(authFile)) { resolve(false); return; }
      try {
        const auth = JSON.parse(readFileSync(authFile, 'utf8')) as Record<string, string>;
        resolve(Boolean(auth?.access_token ?? auth?.token ?? auth?.api_key));
      } catch {
        resolve(false);
      }
    });
  }



  override interruptAgent(): void {
    this.streamInterrupted = true;
    const threadId = this.activeAppServerThreadId;
    const turnId = this.activeAppServerTurnId;
    if (this.appServer && threadId && turnId) {
      void this.appServer.request('turn/interrupt', { threadId, turnId }, 5_000).catch(() => undefined);
    }
    this.shutdownAppServer();
    this.currentStreamProcess?.kill();
  }

  override steerAgent(message: string): void {
    const trimmed = message.trim();
    if (!trimmed) return;
    const threadId = this.activeAppServerThreadId;
    const expectedTurnId = this.activeAppServerTurnId;
    if (this.appServer && threadId && expectedTurnId) {
      void this.appServer.request(
        'turn/steer',
        { threadId, expectedTurnId, input: codexUserInput(trimmed) },
        CODEX_APP_SERVER_REQUEST_TIMEOUT_MS,
      ).catch((err) => {
        this.logger.warn(`Codex app-server steer failed; queueing for next turn: ${err}`);
        this.pendingSteerMessages.push(trimmed);
      });
      return;
    }
    this.pendingSteerMessages.push(trimmed);
  }

  executePromptStreaming(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    systemPrompt?: string,
    runtimeOptions?: AgentRuntimeOptions
  ): Promise<void> {
    if (useAppServerTransport()) {
      return this.executePromptStreamingAppServer(prompt, model, onChunk, callbacks, systemPrompt, runtimeOptions);
    }
    return this.executePromptStreamingExec(prompt, model, onChunk, callbacks, systemPrompt);
  }

  private executePromptStreamingExec(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    systemPrompt?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.streamInterrupted = false;
      if (this.useApiTokenMode) this.ensureSettings();

      const playgroundDir = this.getWorkingDir();
      this.prepareWorkingDir();

      const pendingMessages = this.consumePendingMessages();
      let finalPrompt = prompt;
      if (pendingMessages) {
        finalPrompt = `[Operator Interruption]\n${pendingMessages}\n\n${prompt}`;
      }
      const effectivePrompt = systemPrompt ? `${systemPrompt}\n${finalPrompt}` : finalPrompt;
      const existingSessionId = this.readSessionId();
      const args = this.buildExecArgs(effectivePrompt, model, existingSessionId);
      const codexProcess = spawn(
        getCodexCommand(),
        args,
        { env: { ...process.env, ...this.getProxyEnv(), CODEX_HOME: this.getCodexHomeForSession() }, cwd: playgroundDir, shell: false }
      );
      this.currentStreamProcess = codexProcess;

      let errorResult = '';
      let lineBuffer = '';
      let stderrReasoningStarted = false;
      let capturedThreadId: string | null = null;
      const jsonState: CodexExecJsonState = { errorResult: '', inReasoning: false, hasEmittedOutput: false };

      const handleJsonLine = (raw: string) => {
        handleCodexExecJsonLine(raw, jsonState, {
          onChunk,
          onReasoningStart: callbacks?.onReasoningStart,
          onReasoningChunk: callbacks?.onReasoningChunk,
          onReasoningEnd: callbacks?.onReasoningEnd,
          onTool: callbacks?.onTool,
          onUsage: callbacks?.onUsage,
          onThreadId: (threadId) => {
            capturedThreadId = threadId;
          },
        });
        errorResult = jsonState.errorResult;
      };

      codexProcess.stdout?.on('data', (data: Buffer | string) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const l of lines) handleJsonLine(l);
      });

      codexProcess.stderr?.on('data', (data: Buffer | string) => {
        const text = stripAnsi(data.toString());
        errorResult += text;
        if (callbacks?.onReasoningChunk) {
          if (!stderrReasoningStarted && !jsonState.inReasoning) {
            stderrReasoningStarted = true;
            callbacks.onReasoningStart?.();
          }
          if (text.trim()) jsonState.hasEmittedOutput = true;
          callbacks.onReasoningChunk(text);
        }
      });

      codexProcess.on('close', (code) => {
        this.currentStreamProcess = null;
        if (lineBuffer.trim()) handleJsonLine(lineBuffer);
        if (jsonState.inReasoning || stderrReasoningStarted) callbacks?.onReasoningEnd?.();
        if (this.streamInterrupted) { reject(new Error(INTERRUPTED_MESSAGE)); return; }
        const shouldInspectFailure = (code !== 0 && code !== null) || !jsonState.hasEmittedOutput || Boolean(errorResult.trim());
        if (shouldInspectFailure) {
          const authError = detectProviderAuthFailure('OpenAI Codex', errorResult);
          if (authError) {
            reject(authError);
            return;
          }
        }
        if ((code === 0 || code === null) && !jsonState.hasEmittedOutput) {
          if (!existingSessionId) this.clearSessionId();
          reject(new Error(errorResult.trim() || 'Agent process completed successfully but returned no output. Session not saved.'));
          return;
        }
        if (code !== 0 && code !== null) {
          if (missingSessionError(errorResult)) {
            this.clearSessionId();
          }
          reject(new Error(errorResult.trim() || `Process exited with code ${code}`));
        } else {
          if (capturedThreadId) {
            this.writeSessionId(capturedThreadId);
          }
          resolve();
        }
      });

      codexProcess.on('error', (err) => {
        this.currentStreamProcess = null;
        reject(err);
      });
    });
  }

  private async executePromptStreamingAppServer(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    systemPrompt?: string,
    runtimeOptions?: AgentRuntimeOptions
  ): Promise<void> {
    this.streamInterrupted = false;
    if (this.useApiTokenMode) this.ensureSettings();
    this.prepareWorkingDir();

    const pendingMessages = this.consumePendingMessages();
    let finalPrompt = prompt;
    if (pendingMessages) {
      finalPrompt = `[Operator Interruption]\n${pendingMessages}\n\n${prompt}`;
    }
    const effectivePrompt = systemPrompt ? `${systemPrompt}\n${finalPrompt}` : finalPrompt;
    const existingSessionId = this.readSessionId();
    const appServer = this.createAppServer();
    this.appServer = appServer;

    const unsubscribe = appServer.onNotification((message) => this.handleAppServerNotification(message));
    let capturedThreadId: string | null = null;
    try {
      await this.initializeAppServer(appServer);
      const threadId = existingSessionId
        ? await this.resumeAppServerThread(appServer, existingSessionId, model)
        : await this.startAppServerThread(appServer, model);
      capturedThreadId = threadId;
      this.activeAppServerThreadId = threadId;

      await this.runAppServerTurn(appServer, threadId, effectivePrompt, model, onChunk, callbacks, runtimeOptions);
      if (capturedThreadId) this.writeSessionId(capturedThreadId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const authError = detectProviderAuthFailure('OpenAI Codex', message);
      if (authError) throw authError;
      if (existingSessionId && missingSessionError(message)) this.clearSessionId();
      if (!existingSessionId && capturedThreadId) this.clearSessionId();
      throw err;
    } finally {
      unsubscribe();
      this.appServerTurn = null;
      this.pendingAppServerNotifications = [];
      this.activeAppServerThreadId = null;
      this.activeAppServerTurnId = null;
      this.shutdownAppServer();
    }
  }

  private createAppServer(): JsonLineRpcProcess {
    return new JsonLineRpcProcess(
      getCodexCommand(),
      ['app-server', '--listen', 'stdio://'],
      {
        env: { ...process.env, ...this.getProxyEnv(), CODEX_HOME: this.getCodexHomeForSession() },
        cwd: this.getWorkingDir(),
        logger: this.logger,
        requestTimeoutMs: CODEX_APP_SERVER_REQUEST_TIMEOUT_MS,
      },
    );
  }

  private async initializeAppServer(appServer: JsonLineRpcProcess): Promise<void> {
    await appServer.request('initialize', {
      clientInfo: { name: 'fibe-agent', title: 'Fibe Agent', version: '1' },
      capabilities: { experimentalApi: true },
    });
    appServer.notify('initialized');
  }

  private async startAppServerThread(appServer: JsonLineRpcProcess, model: string): Promise<string> {
    const response = await appServer.request<CodexThreadResponse>('thread/start', {
      ...this.appServerThreadParams(model),
      experimentalRawEvents: false,
    });
    return response.thread.id;
  }

  private async resumeAppServerThread(appServer: JsonLineRpcProcess, threadId: string, model: string): Promise<string> {
    const response = await appServer.request<CodexThreadResponse>('thread/resume', {
      ...this.appServerThreadParams(model),
      threadId,
      excludeTurns: true,
    });
    return response.thread.id;
  }

  private appServerThreadParams(model: string): Record<string, unknown> {
    return {
      model: model || null,
      cwd: this.getWorkingDir(),
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
      persistExtendedHistory: true,
    };
  }

  private async runAppServerTurn(
    appServer: JsonLineRpcProcess,
    threadId: string,
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    runtimeOptions?: AgentRuntimeOptions,
  ): Promise<void> {
    const turnResponse = await appServer.request<CodexTurnResponse>('turn/start', {
      threadId,
      input: codexUserInput(prompt),
      cwd: this.getWorkingDir(),
      model: model || null,
      effort: normalizeEffort(runtimeOptions?.effort),
    });
    const turnId = turnResponse.turn.id;
    this.activeAppServerTurnId = turnId;

    await new Promise<void>((resolve, reject) => {
      let unsubscribeClose: () => void = () => undefined;
      const timer = setTimeout(() => {
        unsubscribeClose();
        reject(new Error('Timed out waiting for Codex app-server turn completion'));
      }, CODEX_APP_SERVER_TURN_TIMEOUT_MS);
      timer.unref?.();
      const state: CodexAppServerTurnState = {
        threadId,
        turnId,
        onChunk,
        callbacks,
        resolve: () => {
          unsubscribeClose();
          clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          unsubscribeClose();
          clearTimeout(timer);
          reject(error);
        },
        errorResult: '',
        reasoningOpen: false,
        hasVisibleOutput: false,
        completed: false,
        assistantTextByItemId: new Map(),
      };
      this.appServerTurn = state;
      unsubscribeClose = appServer.onClose((error) => {
        if (state.completed) return;
        state.completed = true;
        state.reject(this.streamInterrupted ? new Error(INTERRUPTED_MESSAGE) : error);
      });
      const pending = this.pendingAppServerNotifications.splice(0);
      for (const message of pending) this.handleAppServerNotification(message);
    });
  }

  private handleAppServerNotification(message: JsonLineRpcMessage): void {
    const method = message.method ?? '';
    const params = (message.params ?? {}) as Record<string, unknown>;
    const turn = this.appServerTurn;
    if (!turn) {
      this.pendingAppServerNotifications.push(message);
      return;
    }

    const threadId = typeof params.threadId === 'string' ? params.threadId : undefined;
    const turnId = typeof params.turnId === 'string' ? params.turnId : undefined;
    if (threadId && threadId !== turn.threadId) return;
    if (turnId && turnId !== turn.turnId) return;

    switch (method) {
      case 'turn/started':
        this.openAppServerReasoning(turn);
        return;
      case 'item/agentMessage/delta':
        this.closeAppServerReasoning(turn);
        this.emitAppServerAssistantDelta(turn, params);
        return;
      case 'item/reasoning/textDelta':
      case 'item/reasoning/summaryTextDelta':
      case 'item/plan/delta':
      case 'command/exec/outputDelta':
      case 'item/commandExecution/outputDelta':
      case 'item/fileChange/outputDelta':
        this.openAppServerReasoning(turn);
        this.emitAppServerReasoning(turn, typeof params.delta === 'string' ? params.delta : '');
        return;
      case 'item/started':
      case 'item/completed':
        this.handleAppServerItem(turn, params, method === 'item/completed');
        return;
      case 'thread/tokenUsage/updated':
        this.handleAppServerUsage(turn, params);
        return;
      case 'error':
        this.handleAppServerError(turn, params);
        return;
      case 'turn/completed':
        this.handleAppServerTurnCompleted(turn, params);
        return;
      default:
        return;
    }
  }

  private handleAppServerItem(turn: CodexAppServerTurnState, params: Record<string, unknown>, completed: boolean): void {
    const item = params.item as CodexThreadItem | undefined;
    if (!item?.type) return;

    if (item.type === 'agentMessage' && completed && item.text) {
      const emitted = item.id ? turn.assistantTextByItemId.get(item.id) ?? '' : '';
      const delta = item.text.startsWith(emitted) ? item.text.slice(emitted.length) : item.text;
      if (delta) {
        this.closeAppServerReasoning(turn);
        turn.hasVisibleOutput = true;
        turn.onChunk(delta);
        if (item.id) turn.assistantTextByItemId.set(item.id, item.text);
      }
      return;
    }

    if (item.type === 'reasoning') {
      this.openAppServerReasoning(turn);
      for (const text of [...(item.summary ?? []), ...(item.content ?? [])]) {
        this.emitAppServerReasoning(turn, text);
      }
      return;
    }

    if (item.type === 'plan' && item.text) {
      this.openAppServerReasoning(turn);
      this.emitAppServerReasoning(turn, item.text);
      return;
    }

    if (item.type === 'commandExecution') {
      if (item.command) {
        this.openAppServerReasoning(turn);
        this.emitAppServerReasoning(turn, `$ ${item.command}\n`);
      }
      turn.callbacks?.onTool?.({
        kind: 'tool_call',
        name: 'command',
        command: item.command,
        summary: item.aggregatedOutput?.slice(0, RESPONSE_PREVIEW_MAX),
        details: JSON.stringify(item),
      });
      return;
    }

    if (item.type === 'fileChange') {
      for (const change of item.changes ?? []) {
        if (!change.path) continue;
        const fileName = change.path.split(/[/\\]/).pop() ?? 'file';
        turn.callbacks?.onTool?.({
          kind: 'file_created',
          name: fileName,
          path: change.path,
          summary: change.kind ?? change.type,
          details: JSON.stringify(change),
        });
      }
      return;
    }

    if (item.type === 'mcpToolCall' || item.type === 'dynamicToolCall') {
      turn.callbacks?.onTool?.({
        kind: 'tool_call',
        name: item.tool ?? 'tool',
        summary: item.status,
        details: JSON.stringify(item),
      });
    }
  }

  private emitAppServerAssistantDelta(turn: CodexAppServerTurnState, params: Record<string, unknown>): void {
    const delta = typeof params.delta === 'string' ? params.delta : '';
    if (!delta) return;
    const itemId = typeof params.itemId === 'string' ? params.itemId : undefined;
    if (itemId) {
      turn.assistantTextByItemId.set(itemId, (turn.assistantTextByItemId.get(itemId) ?? '') + delta);
    }
    turn.hasVisibleOutput = true;
    turn.onChunk(delta);
  }

  private handleAppServerUsage(turn: CodexAppServerTurnState, params: Record<string, unknown>): void {
    const tokenUsage = params.tokenUsage as { last?: { inputTokens?: number; outputTokens?: number } } | undefined;
    if (!tokenUsage?.last) return;
    turn.callbacks?.onUsage?.({
      inputTokens: tokenUsage.last.inputTokens ?? 0,
      outputTokens: tokenUsage.last.outputTokens ?? 0,
    });
  }

  private handleAppServerError(turn: CodexAppServerTurnState, params: Record<string, unknown>): void {
    const error = params.error as { message?: string } | undefined;
    const message = error?.message ?? 'Codex app-server turn failed';
    turn.errorResult += message;
    if (params.willRetry === false) {
      this.closeAppServerReasoning(turn);
      turn.completed = true;
      turn.reject(new Error(message));
    }
  }

  private handleAppServerTurnCompleted(turn: CodexAppServerTurnState, params: Record<string, unknown>): void {
    if (turn.completed) return;
    const completedTurn = params.turn as { status?: string; error?: { message?: string } | null } | undefined;
    this.closeAppServerReasoning(turn);
    turn.completed = true;

    if (this.streamInterrupted || completedTurn?.status === 'interrupted') {
      turn.reject(new Error(INTERRUPTED_MESSAGE));
      return;
    }
    if (completedTurn?.status === 'failed') {
      turn.reject(new Error(completedTurn.error?.message ?? (turn.errorResult.trim() || 'Codex app-server turn failed')));
      return;
    }
    if (!turn.hasVisibleOutput) {
      turn.reject(new Error(turn.errorResult.trim() || 'Agent process completed successfully but returned no output. Session not saved.'));
      return;
    }
    turn.resolve();
  }

  private openAppServerReasoning(turn: CodexAppServerTurnState): void {
    if (turn.reasoningOpen) return;
    turn.reasoningOpen = true;
    turn.callbacks?.onReasoningStart?.();
  }

  private emitAppServerReasoning(turn: CodexAppServerTurnState, text: string): void {
    if (!text) return;
    turn.callbacks?.onReasoningChunk?.(text);
  }

  private closeAppServerReasoning(turn: CodexAppServerTurnState): void {
    if (!turn.reasoningOpen) return;
    turn.callbacks?.onReasoningEnd?.();
    turn.reasoningOpen = false;
  }

  private shutdownAppServer(): void {
    this.appServer?.close();
    this.appServer = null;
  }
}
