import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { resolveEffort } from '@shared/effort.constants';
import { detectProviderAuthFailure } from '@shared/provider-auth-errors';
import type {
  AgentRuntimeOptions,
  AuthConnection,
  ConversationDataDirProvider,
  LogoutConnection,
  StreamingCallbacks,
  ToolEvent,
} from './strategy.types';
import { INTERRUPTED_MESSAGE } from './strategy.types';
import { AbstractCLIStrategy } from './abstract-cli.strategy';
import { buildProviderArgs, type ProviderArgsConfig } from './provider-args';
import { getEnrichedPath, resolveClaude } from './resolve-claude';
import { toolUseToEvent } from './claude-code.strategy';
import type {
  McpServerConfig,
  Options as ClaudeSdkOptions,
  Query as ClaudeSdkQuery,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';

const ENV_TOKEN_VARS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'] as const;
const PLAYGROUND_DIR = join(process.cwd(), 'playground');
const CLAUDE_WORKSPACE_SUBDIR = 'claude_workspace';
const SESSION_MARKER_FILE = '.claude_session';
const CLAUDE_SDK_CLIENT_APP = 'fibe-agent/claude-sdk';
const SDK_INTERRUPTED_ERROR_NAME = 'AbortError';

const CLAUDE_PROVIDER_ARGS_CONFIG: ProviderArgsConfig = {
  defaultArgs: {},
  blockedArgs: {
    '--dangerously-skip-permissions': true,
    '--no-chrome': true,
    '--effort': false,
    '-p': false,
  },
};

function getClaudeConfigDir(): string {
  return process.env.SESSION_DIR || join(process.env.HOME ?? '/home/node', '.claude');
}

function isNativeHomeFallback(home: string | undefined): boolean {
  return !home || home === '/home/node' || home === '/home/claude';
}

function getClaudeHomeDir(): string {
  const sessionDir = process.env.SESSION_DIR;
  const home = process.env.HOME?.trim();
  if (sessionDir && isNativeHomeFallback(home)) return dirname(sessionDir);
  return home || '/home/node';
}

function getClaudeXdgEnv(): Record<string, string> {
  if (!process.env.SESSION_DIR) return {};
  const homeDir = getClaudeHomeDir();
  const env: Record<string, string> = {};
  if (!process.env.XDG_CONFIG_HOME?.trim()) env.XDG_CONFIG_HOME = join(homeDir, '.config');
  if (!process.env.XDG_DATA_HOME?.trim()) env.XDG_DATA_HOME = join(homeDir, '.local', 'share');
  if (!process.env.XDG_STATE_HOME?.trim()) env.XDG_STATE_HOME = join(homeDir, '.local', 'state');
  if (!process.env.XDG_CACHE_HOME?.trim()) env.XDG_CACHE_HOME = join(homeDir, '.cache');
  return env;
}

function claudeProcessDefaults(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!process.env.BROWSER?.trim()) env.BROWSER = '/bin/true';
  if (!process.env.DISPLAY?.trim()) env.DISPLAY = '';
  return env;
}

function getTokenFilePath(): string {
  return join(getClaudeConfigDir(), 'agent_token.txt');
}

function parseMcpServers(path: string): Record<string, McpServerConfig> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      mcpServers?: Record<string, McpServerConfig>;
    };
    if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
      return parsed.mcpServers;
    }
  } catch {
    /* ignore malformed MCP config; Claude will still load user/project settings */
  }
  return undefined;
}

function providerTokensToExtraArgs(tokens: string[]): Record<string, string | null> {
  const args: Record<string, string | null> = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'dangerously-skip-permissions') continue;
    const next = tokens[i + 1];
    if (next && !next.startsWith('-')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = null;
    }
  }
  return args;
}

function userTextMessage(text: string, sessionId: string | null): SDKUserMessage {
  return {
    type: 'user',
    session_id: sessionId ?? '',
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
    parent_tool_use_id: null,
  };
}

function messageSessionId(message: SDKMessage): string | null {
  const maybe = message as { session_id?: unknown };
  return typeof maybe.session_id === 'string' && maybe.session_id.trim()
    ? maybe.session_id.trim()
    : null;
}

function usageFromObject(
  usage: unknown,
  fallback?: { inputTokens: number; outputTokens: number } | null
): { inputTokens: number; outputTokens: number } | null {
  if (!usage || typeof usage !== 'object') return fallback ?? null;
  const u = usage as {
    input_tokens?: number;
    output_tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
  const inputTokens =
    typeof u.input_tokens === 'number'
      ? u.input_tokens
      : typeof u.inputTokens === 'number'
        ? u.inputTokens
        : fallback?.inputTokens ?? 0;
  const outputTokens =
    typeof u.output_tokens === 'number'
      ? u.output_tokens
      : typeof u.outputTokens === 'number'
        ? u.outputTokens
        : fallback?.outputTokens ?? 0;
  return { inputTokens, outputTokens };
}

function assistantText(message: SDKMessage): string | null {
  if (message.type !== 'assistant') return null;
  const blocks = message.message.content;
  const text = blocks
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return text || null;
}

class AsyncMessageQueue<T> implements AsyncIterable<T>, AsyncIterator<T> {
  private readonly queued: T[] = [];
  private waiter: ((value: IteratorResult<T>) => void) | null = null;
  private closed = false;

  enqueue(value: T): void {
    if (this.closed) throw new Error('Cannot enqueue into a closed Claude SDK input stream');
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter({ done: false, value });
      return;
    }
    this.queued.push(value);
  }

  close(): void {
    this.closed = true;
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter({ done: true, value: undefined });
    }
  }

  next(): Promise<IteratorResult<T>> {
    if (this.queued.length) {
      const value = this.queued.shift() as T;
      return Promise.resolve({ done: false, value });
    }
    if (this.closed) {
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}

interface ClaudeSdkConversationRecord {
  query: ClaudeSdkQuery;
  input: AsyncMessageQueue<SDKUserMessage>;
  iterator: AsyncIterator<SDKMessage>;
  workspaceDir: string;
  sessionId: string | null;
  busy: boolean;
  closed: boolean;
}

interface StreamTurnState {
  inThinking: boolean;
  currentToolBlock: { name?: string; inputStr: string } | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  emittedVisibleOutput: boolean;
  emittedTextDelta: boolean;
  errorText: string;
  sessionId: string | null;
}

export class ClaudeSdkStrategy extends AbstractCLIStrategy {
  private static readonly records = new Map<string, ClaudeSdkConversationRecord>();
  private _pendingAuthCheck: Promise<boolean> | null = null;
  private activeRecord: ClaudeSdkConversationRecord | null = null;

  constructor(useApiTokenMode = false, conversationDataDir?: ConversationDataDirProvider) {
    super(ClaudeSdkStrategy.name, useApiTokenMode, conversationDataDir);
  }

  private getClaudeWorkspaceDir(): string {
    if (this.conversationDataDir) {
      return join(this.conversationDataDir.getConversationDataDir(), CLAUDE_WORKSPACE_SUBDIR);
    }
    return PLAYGROUND_DIR;
  }

  getWorkingDir(): string {
    return this.getClaudeWorkspaceDir();
  }

  private getEnvToken(): string | null {
    for (const key of ENV_TOKEN_VARS) {
      const value = process.env[key];
      if (value && value.trim()) return value.trim();
    }
    return null;
  }

  private getToken(): string | null {
    if (this.useApiTokenMode) {
      const envToken = this.getEnvToken();
      if (envToken) return envToken;
    }
    const tokenPath = getTokenFilePath();
    if (existsSync(tokenPath)) return readFileSync(tokenPath, 'utf8').trim();
    return null;
  }

  private getClaudeProcessEnv(extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...this.getProxyEnv(),
      HOME: getClaudeHomeDir(),
      ...getClaudeXdgEnv(),
      PATH: getEnrichedPath(process.env.PATH ?? ''),
      CLAUDE_AGENT_SDK_CLIENT_APP: CLAUDE_SDK_CLIENT_APP,
      ...extraEnv,
    };
  }

  executeAuth(connection: AuthConnection): void {
    this.currentConnection = connection;
    const token = this.getToken();
    if (this.useApiTokenMode) {
      if (token) {
        connection.sendAuthSuccess();
      } else {
        connection.sendAuthStatus('unauthenticated');
      }
      return;
    }
    connection.sendAuthManualToken();
  }

  submitAuthCode(code: string): void {
    const trimmed = (code ?? '').trim();
    if (!trimmed) {
      this.currentConnection?.sendAuthStatus('unauthenticated');
      return;
    }
    const configDir = getClaudeConfigDir();
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    writeFileSync(getTokenFilePath(), trimmed, { mode: 0o600 });
    this.currentConnection?.sendAuthSuccess();
  }

  clearCredentials(): void {
    const tokenPath = getTokenFilePath();
    if (existsSync(tokenPath)) rmSync(tokenPath, { force: true });
    this.closeAllSdkRecords();
  }

  executeLogout(connection: LogoutConnection): void {
    this.closeAllSdkRecords();
    const token = this.getToken();
    const envOverrides: Record<string, string> = {};
    if (token) envOverrides.CLAUDE_CODE_OAUTH_TOKEN = token;
    const logoutProcess = spawn(resolveClaude(), ['auth', 'logout'], {
      env: this.getClaudeProcessEnv(envOverrides),
      shell: false,
    });
    logoutProcess.stdin?.end();

    const handleOutput = (data: Buffer | string) => connection.sendLogoutOutput(data.toString());
    logoutProcess.stdout?.on('data', handleOutput);
    logoutProcess.stderr?.on('data', handleOutput);
    logoutProcess.on('close', () => connection.sendLogoutSuccess());
    logoutProcess.on('error', () => connection.sendLogoutSuccess());
  }

  checkAuthStatus(): Promise<boolean> {
    const authStatusTimeoutMs = 10_000;

    if (this.useApiTokenMode) {
      return Promise.resolve(this.getToken() !== null);
    }

    const token = this.getToken();
    if (this._pendingAuthCheck) return this._pendingAuthCheck;

    this._pendingAuthCheck = new Promise<boolean>((resolve) => {
      const envOverrides: Record<string, string> = {};
      if (token) envOverrides.CLAUDE_CODE_OAUTH_TOKEN = token;

      const checkProcess = spawn(resolveClaude(), ['auth', 'status'], {
        env: this.getClaudeProcessEnv(envOverrides),
        shell: false,
      });
      checkProcess.stdin?.end();

      let outputStr = '';
      let resolved = false;
      const finish = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        this._pendingAuthCheck = null;
        resolve(result);
      };
      const timer = setTimeout(() => {
        checkProcess.kill();
        finish(false);
      }, authStatusTimeoutMs);

      checkProcess.stdout?.on('data', (data: Buffer | string) => {
        outputStr += data.toString();
      });
      checkProcess.on('close', (code) => {
        if (code !== 0) {
          finish(false);
          return;
        }
        try {
          // eslint-disable-next-line no-control-regex
          const cleaned = outputStr.replace(/\x1b(?:\[[0-9;]*[a-zA-Z]|[=>]?[0-9]*[a-zA-Z]|\][^\x07]*\x07|[78])/g, '').replace(/\r/g, '');
          const jsonStart = cleaned.indexOf('{');
          const jsonEnd = cleaned.lastIndexOf('}');
          const jsonStr = jsonStart !== -1 && jsonEnd !== -1 ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned;
          const status = JSON.parse(jsonStr) as { loggedIn?: boolean };
          finish(status.loggedIn === true);
        } catch {
          finish(false);
        }
      });
      checkProcess.on('error', () => finish(false));
    });

    return this._pendingAuthCheck;
  }

  async executePromptStreaming(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    systemPrompt?: string,
    runtimeOptions?: AgentRuntimeOptions
  ): Promise<void> {
    this.streamInterrupted = false;
    const workspaceDir = this.getClaudeWorkspaceDir();
    if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });

    const record = await this.getOrCreateRecord(workspaceDir, model, systemPrompt, runtimeOptions);
    if (record.busy) {
      throw new Error('AGENT_BUSY');
    }

    record.busy = true;
    this.activeRecord = record;

    const pendingMessages = this.consumePendingMessages();
    const finalPrompt = pendingMessages
      ? `[Operator Interruption]\n${pendingMessages}\n\n${prompt}`
      : prompt;

      const state: StreamTurnState = {
        inThinking: false,
        currentToolBlock: null,
        usage: null,
        emittedVisibleOutput: false,
        emittedTextDelta: false,
        errorText: '',
        sessionId: record.sessionId,
      };

    try {
      record.input.enqueue(userTextMessage(finalPrompt, record.sessionId));
      await this.readUntilTurnComplete(record, state, onChunk, callbacks);
      if (state.errorText.trim()) {
        throw new Error(state.errorText.trim());
      }
      if (!state.emittedVisibleOutput) {
        throw new Error('Agent process completed successfully but returned no output. Session not saved to prevent corruption.');
      }
      if (state.sessionId) {
        record.sessionId = state.sessionId;
        this.writeSessionMarker(workspaceDir, state.sessionId);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (this.streamInterrupted || raw === SDK_INTERRUPTED_ERROR_NAME) {
        throw new Error(INTERRUPTED_MESSAGE);
      }
      const authError = detectProviderAuthFailure('Claude Code', raw);
      if (authError) throw authError;
      this.closeRecord(record);
      throw err;
    } finally {
      record.busy = false;
      if (this.activeRecord === record) this.activeRecord = null;
    }
  }

  override interruptAgent(): void {
    this.streamInterrupted = true;
    const record = this.activeRecord;
    if (!record || record.closed) return;
    void record.query.interrupt().catch(() => {
      this.closeRecord(record);
    });
  }

  hasNativeSessionSupport(): boolean {
    return true;
  }

  private async getOrCreateRecord(
    workspaceDir: string,
    model: string,
    systemPrompt: string | undefined,
    runtimeOptions: AgentRuntimeOptions | undefined
  ): Promise<ClaudeSdkConversationRecord> {
    const existing = ClaudeSdkStrategy.records.get(workspaceDir);
    if (existing && !existing.closed) {
      if (!existing.busy && model.trim()) {
        await existing.query.setModel(model.trim()).catch(() => undefined);
      }
      return existing;
    }

    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const input = new AsyncMessageQueue<SDKUserMessage>();
    const token = this.getToken();
    const envOverrides: Record<string, string> = claudeProcessDefaults();
    if (token) envOverrides.CLAUDE_CODE_OAUTH_TOKEN = token;
    const markerSessionId = this.readSessionMarker(workspaceDir);
    const mcpServers = parseMcpServers(join(workspaceDir, '.mcp.json'));
    const options: ClaudeSdkOptions = {
      cwd: workspaceDir,
      env: this.getClaudeProcessEnv(envOverrides),
      pathToClaudeCodeExecutable: resolveClaude(),
      model: model.trim() || undefined,
      effort: resolveEffort(runtimeOptions?.effort ?? process.env.CLAUDE_EFFORT),
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      includePartialMessages: true,
      additionalDirectories: this.getPlaygroundDirs(),
      extraArgs: providerTokensToExtraArgs(buildProviderArgs(CLAUDE_PROVIDER_ARGS_CONFIG)),
      ...(mcpServers ? { mcpServers } : {}),
      ...(markerSessionId ? { resume: markerSessionId } : {}),
      ...(systemPrompt
        ? { systemPrompt: { type: 'preset', preset: 'claude_code', append: systemPrompt.trim() } }
        : {}),
    };

    const sdkQuery = query({ prompt: input, options });
    const record: ClaudeSdkConversationRecord = {
      query: sdkQuery,
      input,
      iterator: sdkQuery[Symbol.asyncIterator](),
      workspaceDir,
      sessionId: markerSessionId,
      busy: false,
      closed: false,
    };
    ClaudeSdkStrategy.records.set(workspaceDir, record);
    return record;
  }

  private async readUntilTurnComplete(
    record: ClaudeSdkConversationRecord,
    state: StreamTurnState,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks
  ): Promise<void> {
    while (true) {
      const { value, done } = await record.iterator.next();
      if (done) break;
      this.handleSdkMessage(value, state, onChunk, callbacks);
      if (value.type === 'result') break;
    }
  }

  private handleSdkMessage(
    message: SDKMessage,
    state: StreamTurnState,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks
  ): void {
    const nextSessionId = messageSessionId(message);
    if (nextSessionId) state.sessionId = nextSessionId;

    if (message.type === 'assistant') {
      const error = message.error;
      if (error) state.errorText += `${state.errorText ? '\n' : ''}${error}`;
      if (!state.emittedTextDelta) {
        const text = assistantText(message);
        if (text) {
          state.emittedVisibleOutput = true;
          onChunk(text);
        }
      }
      return;
    }

    if (message.type === 'result') {
      const usage = usageFromObject(message.usage, state.usage);
      if (usage) {
        state.usage = usage;
        callbacks?.onUsage?.(usage);
      }
      if (message.is_error) {
        const errors = 'errors' in message ? message.errors.join('\n') : message.result;
        state.errorText += `${state.errorText ? '\n' : ''}${errors}`;
      } else if (!state.emittedVisibleOutput && 'result' in message && message.result) {
        state.emittedVisibleOutput = true;
        onChunk(message.result);
      }
      return;
    }

    if (message.type === 'stream_event') {
      this.handleStreamEvent(message.event as unknown, state, onChunk, callbacks);
    }
  }

  private handleStreamEvent(
    rawEvent: unknown,
    state: StreamTurnState,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks
  ): void {
    if (!rawEvent || typeof rawEvent !== 'object') return;
    const ev = rawEvent as {
      type?: string;
      delta?: { type?: string; text?: string; thinking?: string; partial_json?: string };
      content_block?: { type?: string; name?: string; input?: unknown };
      message?: { usage?: unknown };
      usage?: unknown;
    };

    if (ev.type === 'message_start') {
      state.usage = usageFromObject(ev.message?.usage, state.usage);
    }
    if (ev.type === 'message_delta') {
      state.usage = usageFromObject(ev.usage, state.usage);
    }
    if (ev.type === 'message_stop' && state.usage) {
      callbacks?.onUsage?.(state.usage);
    }

    if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
      state.currentToolBlock = { name: ev.content_block.name, inputStr: '' };
      return;
    }

    if (ev.type === 'content_block_delta' && ev.delta) {
      if (ev.delta.type === 'text_delta' && ev.delta.text) {
        if (state.inThinking) {
          callbacks?.onReasoningEnd?.();
          state.inThinking = false;
        }
        state.emittedVisibleOutput = true;
        state.emittedTextDelta = true;
        onChunk(ev.delta.text);
      }
      if (ev.delta.type === 'thinking_delta') {
        const thinkingChunk = ev.delta.thinking ?? ev.delta.text ?? '';
        if (thinkingChunk) {
          if (!state.inThinking) {
            state.inThinking = true;
            callbacks?.onReasoningStart?.();
          }
          callbacks?.onReasoningChunk?.(thinkingChunk);
        }
      }
      if (ev.delta.type === 'input_json_delta' && state.currentToolBlock) {
        state.currentToolBlock.inputStr += ev.delta.partial_json || '';
      }
      return;
    }

    if (ev.type === 'content_block_stop') {
      if (state.inThinking) {
        callbacks?.onReasoningEnd?.();
        state.inThinking = false;
        return;
      }
      if (!state.currentToolBlock) return;
      let input: Record<string, unknown> | undefined;
      try {
        if (state.currentToolBlock.inputStr.trim()) {
          input = JSON.parse(state.currentToolBlock.inputStr) as Record<string, unknown>;
        }
      } catch {
        /* ignore malformed tool input */
      }
      const event: ToolEvent = toolUseToEvent({ name: state.currentToolBlock.name }, input);
      callbacks?.onTool?.(event);
      state.currentToolBlock = null;
    }
  }

  private readSessionMarker(workspaceDir: string): string | null {
    if (!this.conversationDataDir) return null;
    const markerPath = join(workspaceDir, SESSION_MARKER_FILE);
    if (!existsSync(markerPath)) return null;
    const stored = readFileSync(markerPath, 'utf8').trim();
    return stored || null;
  }

  private writeSessionMarker(workspaceDir: string, sessionId: string): void {
    if (!this.conversationDataDir) return;
    try {
      writeFileSync(join(workspaceDir, SESSION_MARKER_FILE), sessionId);
    } catch {
      /* ignore */
    }
  }

  private closeRecord(record: ClaudeSdkConversationRecord): void {
    if (record.closed) return;
    record.closed = true;
    record.input.close();
    record.query.close();
    ClaudeSdkStrategy.records.delete(record.workspaceDir);
  }

  private closeAllSdkRecords(): void {
    for (const record of ClaudeSdkStrategy.records.values()) {
      this.closeRecord(record);
    }
  }

  private getPlaygroundDirs(): string[] {
    try {
      if (!existsSync(PLAYGROUND_DIR)) return [];
      return readdirSync(PLAYGROUND_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(PLAYGROUND_DIR, entry.name));
    } catch {
      return [];
    }
  }
}
