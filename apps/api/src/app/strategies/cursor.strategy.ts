import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { detectProviderAuthFailure } from '@shared/provider-auth-errors';
import type {
  AuthConnection,
  ConversationDataDirProvider,
  LogoutConnection,
  StreamingCallbacks,
  TokenUsage,
  ToolEvent,
} from './strategy.types';
import { INTERRUPTED_MESSAGE } from './strategy.types';
import { AbstractCLIStrategy } from './abstract-cli.strategy';
import { buildProviderArgs, type ProviderArgsConfig } from './provider-args';

const DEFAULT_CURSOR_HOME = join(process.env.HOME ?? '/home/node', '.cursor');
const CURSOR_WORKSPACE_SUBDIR = 'cursor_workspace';
const SESSION_MARKER_FILE = '.cursor_session';
const CURSOR_API_KEY_ENV = 'CURSOR_API_KEY';
const CURSOR_BIN_NAME =
  process.platform === 'win32' ? 'cursor-agent.cmd' : 'cursor-agent';
const RESPONSE_PREVIEW_MAX = 200;
const CURSOR_AUTH_FILE = 'auth.json';

const CURSOR_PROVIDER_ARGS_CONFIG: ProviderArgsConfig = {
  defaultArgs: {},
  blockedArgs: {
    // Always enforce non-interactive mode.
    '--print': true,
    '--force': true,
    // Output format, always enforced for structured parsing
    '--output-format': 'stream-json',
    '--stream-partial-output': true,
    '--resume': false,
    '--output-json': false,
    '-p': false,
  },
};

function getCursorHome(): string {
  return (
    process.env.CURSOR_CONFIG_HOME ??
    process.env.SESSION_DIR ??
    DEFAULT_CURSOR_HOME
  );
}

function getCursorCommand(): string {
  if (process.env.CURSOR_AGENT_BIN?.trim())
    return process.env.CURSOR_AGENT_BIN.trim();
  return CURSOR_BIN_NAME;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*[a-zA-Z]/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, '');
interface CursorStreamContentPart {
  type?: string;
  text?: string;
}

interface CursorToolCallArgs {
  path?: string;
  filePath?: string;
  command?: string;
  toolCallId?: string;
}

interface CursorToolCall {
  [toolName: string]: {
    args?: CursorToolCallArgs & Record<string, unknown>;
  };
}

interface CursorStreamEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  message?: {
    role?: string;
    content?: CursorStreamContentPart[];
  };
  tool_call?: CursorToolCall;
  result?: string;
  error?: string;
  model?: string;
  timestamp_ms?: number;
  model_call_id?: string;
  is_error?: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface CursorExecJsonState {
  errorResult: string;
  lastAssistantChunk: string;
  hasStartedReasoning: boolean;
  hasEmittedOutput: boolean;
  hasPartialOutput?: boolean;
  terminalSuccess?: boolean;
}

export interface CursorExecJsonHandlers {
  onChunk: (chunk: string) => void;
  onReasoningStart?: () => void;
  onReasoningChunk?: (text: string) => void;
  onReasoningEnd?: () => void;
  onTool?: (event: ToolEvent) => void;
  onUsage?: (usage: TokenUsage) => void;
  onSessionId?: (sessionId: string) => void;
}

function preview(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.length > RESPONSE_PREVIEW_MAX
    ? `${text.slice(0, RESPONSE_PREVIEW_MAX)}…`
    : text;
}

function getToolName(toolCall: CursorToolCall | undefined): string | undefined {
  if (!toolCall) return undefined;
  return Object.keys(toolCall)[0];
}

function getToolArgs(
  toolCall: CursorToolCall | undefined,
): CursorToolCallArgs | undefined {
  if (!toolCall) return undefined;
  const toolName = getToolName(toolCall);
  if (!toolName) return undefined;
  return toolCall[toolName]?.args;
}

function getUsage(event: CursorStreamEvent): TokenUsage {
  return {
    inputTokens: event.usage?.inputTokens ?? 0,
    outputTokens: event.usage?.outputTokens ?? 0,
  };
}

export function handleCursorExecJsonLine(
  line: string,
  state: CursorExecJsonState,
  handlers: CursorExecJsonHandlers,
): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  const startReasoning = () => {
    if (state.hasStartedReasoning) return;
    state.hasStartedReasoning = true;
    handlers.onReasoningStart?.();
  };

  const endReasoning = () => {
    if (!state.hasStartedReasoning) return;
    handlers.onReasoningEnd?.();
    state.hasStartedReasoning = false;
  };

  try {
    const event = JSON.parse(trimmed) as CursorStreamEvent;
    const type = event.type ?? '';

    if (event.session_id) {
      handlers.onSessionId?.(event.session_id);
    }

    if (type === 'system' && event.subtype === 'init') {
      startReasoning();
      if (event.model) {
        handlers.onReasoningChunk?.(`Model: ${event.model}\n`);
      }
      return;
    }

    if (type === 'assistant') {
      startReasoning();
      const text = (event.message?.content ?? [])
        .filter((part) => part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text ?? '')
        .join('');
      if (!text) return;
      // Partial streams also flush buffered and complete messages. Those repeat
      // text already emitted as timestamped deltas.
      if (event.model_call_id) return;
      if (event.timestamp_ms !== undefined) {
        state.hasPartialOutput = true;
      } else if (state.hasPartialOutput || text === state.lastAssistantChunk) {
        return;
      }
      state.lastAssistantChunk = text;
      if (text.trim()) state.hasEmittedOutput = true;
      handlers.onReasoningChunk?.(preview(text) ?? text);
      handlers.onChunk(text);
      return;
    }

    if (type === 'tool_call' && event.subtype === 'started') {
      startReasoning();
      const toolName = getToolName(event.tool_call) ?? 'tool';
      const args = getToolArgs(event.tool_call);
      const path = args?.path ?? args?.filePath;
      const command = args?.command;
      const isFileTool = /read|write|edit|delete|file/i.test(toolName);
      state.hasEmittedOutput = true;
      handlers.onReasoningChunk?.(
        `${toolName}${path ? `: ${path}` : command ? `: ${command}` : ''}\n`,
      );
      handlers.onTool?.(
        isFileTool && path
          ? {
              kind: 'file_created',
              name: path.split(/[/\\]/).pop() ?? toolName,
              path,
              summary: toolName,
            }
          : {
              kind: 'tool_call',
              name: toolName,
              path,
              command,
              summary: preview(JSON.stringify(args)),
              details: JSON.stringify(args ?? {}),
            },
      );
      return;
    }

    if (type === 'result') {
      endReasoning();
      state.terminalSuccess = event.subtype === 'success' && !event.is_error;
      if (!state.terminalSuccess) {
        state.errorResult +=
          event.error ||
          event.result ||
          'Cursor returned an unsuccessful result.';
        return;
      }
      if (typeof event.result === 'string' && event.result.trim()) {
        state.hasEmittedOutput = true;
      }
      if (typeof event.result === 'string' && !state.lastAssistantChunk) {
        handlers.onChunk(event.result);
      }
      handlers.onUsage?.(getUsage(event));
      return;
    }

    if (type === 'error') {
      endReasoning();
      const msg = event.error ?? 'Unknown cursor error';
      state.errorResult += msg;
      if (msg.trim()) state.hasEmittedOutput = true;
      handlers.onChunk(`⚠️ ${msg}`);
      return;
    }
  } catch {
    const cleaned = stripAnsi(trimmed);
    if (cleaned) {
      state.hasEmittedOutput = true;
      handlers.onChunk(cleaned);
    }
  }
}

export class CursorStrategy extends AbstractCLIStrategy {
  constructor(
    useApiTokenMode = false,
    conversationDataDir?: ConversationDataDirProvider,
  ) {
    super(CursorStrategy.name, useApiTokenMode, conversationDataDir);
  }

  private getCursorHomeForSession(): string {
    return getCursorHome();
  }

  private getSessionMarkerPath(): string {
    return join(this.getWorkingDir(), SESSION_MARKER_FILE);
  }

  private getAuthFilePath(): string {
    return join(this.getCursorHomeForSession(), CURSOR_AUTH_FILE);
  }

  private getStoredApiKey(): string | null {
    try {
      const authPath = this.getAuthFilePath();
      if (!existsSync(authPath)) return null;
      const parsed = JSON.parse(readFileSync(authPath, 'utf8')) as Record<
        string,
        string
      >;
      return parsed.api_key?.trim() || parsed.token?.trim() || null;
    } catch {
      return null;
    }
  }

  private isAuthenticated(): boolean {
    return Boolean(
      process.env[CURSOR_API_KEY_ENV]?.trim() ||
        process.env.CURSOR_AUTH_TOKEN?.trim() ||
        this.getStoredApiKey(),
    );
  }

  private buildCursorEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CURSOR_CONFIG_HOME: this.getCursorHomeForSession(),
      ...this.getProxyEnv(),
    };
    const storedKey = this.getStoredApiKey();
    if (!env[CURSOR_API_KEY_ENV]?.trim() && storedKey) {
      env[CURSOR_API_KEY_ENV] = storedKey;
    }
    return env;
  }

  private readSessionId(): string | null {
    try {
      const markerPath = this.getSessionMarkerPath();
      if (!existsSync(markerPath)) return null;
      return readFileSync(markerPath, 'utf8').trim() || null;
    } catch {
      return null;
    }
  }

  private writeSessionId(sessionId: string): void {
    const workspaceDir = this.getWorkingDir();
    if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(this.getSessionMarkerPath(), sessionId, { mode: 0o600 });
  }

  private clearSessionId(): void {
    try {
      const markerPath = this.getSessionMarkerPath();
      if (existsSync(markerPath)) unlinkSync(markerPath);
    } catch {
      /* ignore cleanup errors */
    }
  }

  getWorkingDir(): string {
    if (this.conversationDataDir) {
      return join(
        this.conversationDataDir.getConversationDataDir(),
        CURSOR_WORKSPACE_SUBDIR,
      );
    }
    return join(process.cwd(), CURSOR_WORKSPACE_SUBDIR);
  }

  getModelArgs(model: string): string[] {
    if (!model || model === 'undefined') return [];
    return ['--model', model];
  }

  private buildExecArgs(
    prompt: string,
    model: string,
    sessionId: string | null,
  ): string[] {
    const modelArgs = this.getModelArgs(model);
    const providerTokens = buildProviderArgs({
      ...CURSOR_PROVIDER_ARGS_CONFIG,
      blockedArgs: {
        ...CURSOR_PROVIDER_ARGS_CONFIG.blockedArgs,
        ...(modelArgs.length ? { '--model': false } : {}),
      },
    });
    const baseArgs = [...modelArgs, ...providerTokens];
    if (sessionId) {
      return [...baseArgs, '--resume', sessionId, '--', prompt];
    }
    return [...baseArgs, '--', prompt];
  }

  hasNativeSessionSupport(): boolean {
    return this.readSessionId() !== null;
  }

  ensureSettings(): void {
    const cursorHome = this.getCursorHomeForSession();
    if (!existsSync(cursorHome)) {
      mkdirSync(cursorHome, { recursive: true });
    }
  }

  executeAuth(connection: AuthConnection): void {
    this.currentConnection = connection;
    if (this.isAuthenticated()) {
      connection.sendAuthSuccess();
      this.currentConnection = null;
      return;
    }
    if (this.useApiTokenMode) {
      connection.sendAuthManualToken();
      return;
    }
    this.ensureSettings();
    const child = spawn(getCursorCommand(), ['login'], {
      env: { ...this.buildCursorEnv(), NO_OPEN_BROWSER: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.activeAuthProcess = child;
    let output = '';
    let sentUrl = false;
    const timer = setTimeout(
      () => {
        child.kill();
        connection.sendError('Cursor sign-in timed out. Please try again.');
      },
      6 * 60 * 1000,
    );
    const readOutput = (data: Buffer | string) => {
      output += stripAnsi(data.toString());
      const url = output.match(
        /https:\/\/cursor\.com\/loginDeepControl[^\s]+/,
      )?.[0];
      if (url && !sentUrl) {
        sentUrl = true;
        connection.sendAuthUrlGenerated(url);
      }
    };
    child.stdout?.on('data', readOutput);
    child.stderr?.on('data', readOutput);
    child.on('error', () => {
      clearTimeout(timer);
      if (this.currentConnection === connection) {
        connection.sendError('Could not start Cursor sign-in.');
        this.currentConnection = null;
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      this.activeAuthProcess = null;
      this.authCancel = null;
      if (this.currentConnection !== connection) return;
      this.currentConnection = null;
      if (code === 0) connection.sendAuthSuccess();
      else connection.sendError('Cursor sign-in did not complete.');
    });
    this.authCancel = () => {
      clearTimeout(timer);
      child.kill();
    };
  }

  submitAuthCode(code: string): void {
    const trimmed = (code ?? '').trim();
    if (!trimmed) {
      this.currentConnection?.sendAuthStatus('unauthenticated');
      return;
    }
    this.ensureSettings();
    writeFileSync(
      this.getAuthFilePath(),
      JSON.stringify({ api_key: trimmed }),
      { mode: 0o600 },
    );
    this.currentConnection?.sendAuthSuccess();
    this.currentConnection = null;
  }

  clearCredentials(): void {
    const authPath = this.getAuthFilePath();
    if (existsSync(authPath)) unlinkSync(authPath);
    this.clearSessionId();
  }

  executeLogout(connection: LogoutConnection): void {
    this.cancelAuth();
    this.clearCredentials();
    if (this.useApiTokenMode) {
      connection.sendLogoutSuccess();
      return;
    }
    const child = spawn(getCursorCommand(), ['logout'], {
      env: this.buildCursorEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      child.kill();
      connection.sendError('Cursor logout timed out.');
    }, 15_000);
    child.on('error', () => {
      clearTimeout(timer);
      connection.sendError('Could not start Cursor logout.');
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) connection.sendLogoutSuccess();
      else connection.sendError('Cursor logout did not complete.');
    });
  }

  checkAuthStatus(): Promise<boolean> {
    if (this.isAuthenticated()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const child = spawn(getCursorCommand(), ['status', '--format', 'json'], {
        env: this.buildCursorEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, 15_000);
      child.stdout?.on('data', (data: Buffer | string) => {
        output += data.toString();
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          const status = JSON.parse(output) as { isAuthenticated?: boolean };
          resolve(code === 0 && status.isAuthenticated === true);
        } catch {
          resolve(false);
        }
      });
    });
  }

  listModels(): Promise<string[]> {
    return new Promise((resolve) => {
      const child = spawn(getCursorCommand(), ['models'], {
        env: this.buildCursorEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      const timer = setTimeout(() => {
        child.kill();
        resolve([]);
      }, 15_000);
      child.stdout?.on('data', (data: Buffer | string) => {
        output += data.toString();
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve([]);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          resolve([]);
          return;
        }
        const models = stripAnsi(output)
          .split('\n')
          .flatMap((line) => {
            // CLI prints model IDs followed by display labels. Never return headers.
            const match = line
              .trim()
              .match(/^([a-z0-9][a-z0-9._-]*)(?:\s+-\s+\S.*)?$/);
            return match ? [match[1]] : [];
          });
        resolve([...new Set(models)]);
      });
    });
  }

  executePromptStreaming(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    systemPrompt?: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.streamInterrupted = false;
      this.ensureSettings();

      const playgroundDir = this.getWorkingDir();
      if (!existsSync(playgroundDir))
        mkdirSync(playgroundDir, { recursive: true });

      const pendingMessages = this.consumePendingMessages();
      let finalPrompt = prompt;
      if (pendingMessages) {
        finalPrompt = `[Operator Interruption]\n${pendingMessages}\n\n${prompt}`;
      }
      const effectivePrompt = systemPrompt
        ? `${systemPrompt}\n${finalPrompt}`
        : finalPrompt;
      const existingSessionId = this.readSessionId();
      const args = this.buildExecArgs(
        effectivePrompt,
        model,
        existingSessionId,
      );
      const cursorProcess = spawn(getCursorCommand(), args, {
        env: this.buildCursorEnv(),
        cwd: playgroundDir,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.currentStreamProcess = cursorProcess;

      let errorResult = '';
      let lineBuffer = '';
      const jsonState: CursorExecJsonState = {
        errorResult: '',
        lastAssistantChunk: '',
        hasStartedReasoning: false,
        hasEmittedOutput: false,
      };
      let capturedSessionId: string | null = null;

      const handleJsonLine = (raw: string) => {
        handleCursorExecJsonLine(raw, jsonState, {
          onChunk,
          onReasoningStart: callbacks?.onReasoningStart,
          onReasoningChunk: callbacks?.onReasoningChunk,
          onReasoningEnd: callbacks?.onReasoningEnd,
          onTool: callbacks?.onTool,
          onUsage: callbacks?.onUsage,
          onSessionId: (sessionId) => {
            capturedSessionId = sessionId;
          },
        });
        if (jsonState.errorResult) {
          errorResult += jsonState.errorResult;
          jsonState.errorResult = '';
        }
      };

      cursorProcess.stdout?.on('data', (data: Buffer | string) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) handleJsonLine(line);
      });

      cursorProcess.stderr?.on('data', (data: Buffer | string) => {
        errorResult += stripAnsi(data.toString());
      });

      cursorProcess.on('error', (err) => {
        this.currentStreamProcess = null;
        reject(err);
      });

      cursorProcess.on('close', (code) => {
        this.currentStreamProcess = null;
        if (lineBuffer.trim()) handleJsonLine(lineBuffer);

        if (this.streamInterrupted) {
          reject(new Error(INTERRUPTED_MESSAGE));
          return;
        }

        const shouldInspectFailure =
          code !== 0 ||
          !jsonState.hasEmittedOutput ||
          Boolean(errorResult.trim());
        if (shouldInspectFailure) {
          const authError = detectProviderAuthFailure('Cursor', errorResult);
          if (authError) {
            reject(authError);
            return;
          }
        }

        if (code === 0) {
          if (!jsonState.terminalSuccess || !jsonState.hasEmittedOutput) {
            if (!existingSessionId) this.clearSessionId();
            reject(
              new Error(
                errorResult.trim() ||
                  'Cursor stream ended without a successful result or returned no output. Session not saved to prevent corruption.',
              ),
            );
            return;
          }
          if (capturedSessionId) {
            this.writeSessionId(capturedSessionId);
          }
          resolve();
          return;
        }

        const message =
          errorResult.trim() || 'Cursor agent exited with a non-zero status';
        if (this.missingSessionError(message)) {
          this.clearSessionId();
        }
        reject(new Error(message));
      });
    });
  }
}
