import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectProviderAuthFailure } from '@shared/provider-auth-errors';
import type {
  AgentRuntimeOptions,
  AuthConnection,
  ConversationDataDirProvider,
  LogoutConnection,
  StreamingCallbacks,
  TokenUsage,
  ToolEvent,
} from './strategy.types';
import { INTERRUPTED_MESSAGE } from './strategy.types';
import { buildProviderArgs, type ProviderArgsConfig } from './provider-args';
import { AbstractCLIStrategy } from './abstract-cli.strategy';
import { HttpAppServerProcess } from './http-app-server-process';
import { ProviderConversationPaths } from './provider-conversation-paths';

const PLAYGROUND_DIR = join(process.cwd(), 'playground');
const OPENCODE_WORKSPACE_SUBDIR = 'opencode_workspace';
const SESSION_MARKER_FILE = '.opencode_session';
const OPENCODE_CONFIG_FILE = 'opencode.json';
const OPENCODE_APP_SERVER_REQUEST_TIMEOUT_MS = 120_000;
const OPENCODE_APP_SERVER_TURN_TIMEOUT_MS = 60 * 60 * 1000;
const MISSING_SESSION_ERROR_PATTERNS = [
  /No conversation found with session ID:/i,
  /\b(conversation|session)\b[^\n]*\b(not found|missing)\b/i,
  /\b(failed|unable)\b[^\n]*\b(resume|continue)\b/i,
];

/**
 * Full-yolo opencode.json config that auto-approves everything.
 * Without this, `external_directory` defaults to "ask" which auto-rejects
 * in non-interactive CLI `run` mode — blocking access to /app/data, /app/skills, etc.
 */
const YOLO_CONFIG = JSON.stringify(
  {
    $schema: 'https://opencode.ai/config.json',
    permission: 'allow',
    autoupdate: false,
    share: 'disabled',
  },
  null,
  2,
);

/**
 * Well-known API key env vars that OpenCode CLI can read.
 * If ANY of these are set in process.env, the auth modal is skipped.
 */
const API_KEY_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
] as const;

function opencodeDataDir(): string {
  return process.env.SESSION_DIR || join(process.env.HOME ?? '/home/node', '.local', 'share', 'opencode');
}

const OPENCODE_PROVIDER_ARGS_CONFIG: ProviderArgsConfig = {
  defaultArgs: {
    '--thinking': true,
  },
  blockedArgs: {
    // Output format, always enforced for structured parsing
    '--format': 'json',
  },
};

const OPENCODE_SESSION_PERMISSION_ALLOW_ALL = [
  { permission: '*', pattern: '*', action: 'allow' },
];

/**
 * Build opencode CLI `run` args. The `'--'` separator forces the prompt to be
 * treated as a positional even when it starts with `-` (e.g. a system prompt
 * beginning with a markdown bullet). Without it, yargs rejects the arg as an
 * unknown flag.
 */
export function buildOpencodeRunArgs(
  effectivePrompt: string,
  modelArgs: string[],
  hasSession: boolean
): string[] {
  return [
    'run',
    ...(hasSession ? ['--continue'] : []),
    ...modelArgs,
    ...buildProviderArgs(OPENCODE_PROVIDER_ARGS_CONFIG),
    '--',
    effectivePrompt,
  ];
}

function opencodeAuthFile(): string {
  return join(opencodeDataDir(), 'auth.json');
}

/**
 * Returns true if at least one well-known API key env var is set.
 */
function hasEnvApiKey(): boolean {
  return API_KEY_ENV_VARS.some((k) => !!process.env[k]?.trim());
}

function missingSessionError(message: string): boolean {
  return MISSING_SESSION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function useAppServerTransport(): boolean {
  const explicitTransport = (process.env.OPENCODE_AGENT_TRANSPORT ?? '').trim().toLowerCase();
  if (explicitTransport === 'run' || explicitTransport === 'cli') return false;
  if (explicitTransport === 'app-server' || explicitTransport === 'appserver') return true;

  const explicitFlag = (process.env.OPENCODE_USE_APP_SERVER ?? '').trim().toLowerCase();
  if (['0', 'false', 'no'].includes(explicitFlag)) return false;
  return true;
}

function parseOpencodeModel(model: string): { providerID: string; modelID: string } | undefined {
  if (!model || model === 'undefined') return undefined;
  const slash = model.indexOf('/');
  if (slash <= 0 || slash === model.length - 1) return undefined;
  return {
    providerID: model.slice(0, slash),
    modelID: model.slice(slash + 1),
  };
}

function normalizeVariant(effort?: string): string | undefined {
  const normalized = effort?.trim();
  return normalized || undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const maybeData = error as { data?: unknown; message?: unknown; name?: unknown };
    if (typeof maybeData.message === 'string') return maybeData.message;
    if (typeof maybeData.name === 'string') return maybeData.name;
    if (maybeData.data && typeof maybeData.data === 'object') {
      const data = maybeData.data as { message?: unknown };
      if (typeof data.message === 'string') return data.message;
    }
  }
  return JSON.stringify(error);
}

interface OpenCodeSession {
  id: string;
  title?: string;
}

interface OpenCodeMessage {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
  error?: unknown;
}

interface OpenCodePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  tool?: string;
  callID?: string;
  state?: {
    status?: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    title?: string;
    metadata?: unknown;
  };
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
}

interface OpenCodeMessageResponse {
  info: OpenCodeMessage;
  parts: OpenCodePart[];
}

interface OpenCodeEvent {
  type?: string;
  properties?: {
    sessionID?: string;
    messageID?: string;
    partID?: string;
    field?: string;
    delta?: string;
    part?: OpenCodePart;
    info?: OpenCodeMessage | OpenCodeSession;
    error?: unknown;
  };
}

interface OpenCodeEventState {
  sessionId: string;
  onChunk: (chunk: string) => void;
  callbacks?: StreamingCallbacks;
  errorResult: string;
  reasoningOpen: boolean;
  hasVisibleOutput: boolean;
  textByPartId: Map<string, string>;
  rawTextByPartId: Map<string, string>;
  partTypeById: Map<string, string>;
  emittedToolStateByPartId: Map<string, string>;
  /** message role (user|assistant) keyed by messageID — used to skip user-message text parts */
  messageRoleById: Map<string, string>;
}

export class OpencodeStrategy extends AbstractCLIStrategy {
  private readonly paths: ProviderConversationPaths;
  private appServer: HttpAppServerProcess | null = null;
  private activeAppServerSessionId: string | null = null;
  private activeSseAbort: AbortController | null = null;
  private activePromptAbort: AbortController | null = null;

  constructor(conversationDataDir?: ConversationDataDirProvider) {
    super(OpencodeStrategy.name, false, conversationDataDir);
    this.paths = new ProviderConversationPaths({
      conversationDataDir,
      workspaceSubdir: OPENCODE_WORKSPACE_SUBDIR,
      fallbackWorkspaceDir: PLAYGROUND_DIR,
      sessionMarkerFile: SESSION_MARKER_FILE,
    });
  }

  private getOpencodeWorkspaceDir(): string {
    return this.paths.getWorkspaceDir();
  }

  getWorkingDir(): string {
    return this.getOpencodeWorkspaceDir();
  }

  prepareWorkingDir(): void {
    this.paths.prepareWorkspace();
  }

  private readStoredSession(): string | null {
    return this.paths.readSessionMarker();
  }

  private writeStoredSession(sessionId: string): void {
    this.paths.writeSessionMarker(sessionId);
  }

  private clearStoredSession(): void {
    this.paths.clearSessionMarker();
  }

  /**
   * Reads a manually stored API key from the auth file (set via auth modal).
   */
  private getStoredApiKey(): string | null {
    const authFile = opencodeAuthFile();
    if (!existsSync(authFile)) return null;
    try {
      const content = readFileSync(authFile, 'utf8');
      const auth = JSON.parse(content) as { api_key?: string };
      return auth?.api_key?.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Returns true when authenticated — either via env vars OR stored key.
   */
  checkAuthStatus(): Promise<boolean> {
    return Promise.resolve(hasEnvApiKey() || this.getStoredApiKey() !== null);
  }

  /**
   * If env vars are already set, immediately signal success (no modal).
   * Otherwise, show the manual token input modal.
   */
  executeAuth(connection: AuthConnection): void {
    this.currentConnection = connection;

    if (hasEnvApiKey()) {
      this.logger.log('API key found in environment — skipping auth modal');
      connection.sendAuthSuccess();
      return;
    }

    connection.sendAuthManualToken();
  }

  submitAuthCode(code: string): void {
    const trimmed = (code ?? '').trim();
    if (trimmed) {
      const dataDir = opencodeDataDir();
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      writeFileSync(
        opencodeAuthFile(),
        JSON.stringify({ api_key: trimmed }),
        { mode: 0o600 }
      );
      if (this.currentConnection) {
        this.currentConnection.sendAuthSuccess();
      }
    } else {
      this.currentConnection?.sendAuthStatus('unauthenticated');
    }
  }

  override cancelAuth(): void {
    this.currentConnection = null;
  }

  clearCredentials(): void {
    const authFile = opencodeAuthFile();
    if (existsSync(authFile)) {
      rmSync(authFile, { force: true });
    }
  }

  executeLogout(connection: LogoutConnection): void {
    this.clearCredentials();
    connection.sendLogoutSuccess();
  }

  getModelArgs(model: string): string[] {
    if (!model || model === 'undefined') return [];

    let resolved = model;

    // When OpenRouter is the active provider, ensure the model ID has
    // the openrouter/ prefix that opencode expects (e.g. openrouter/openai/gpt-5.4).
    // This lets MODEL_OPTIONS and custom model input use short forms like openai/gpt-5.4.
    if (
      !resolved.startsWith('openrouter/') &&
      (process.env.OPENROUTER_API_KEY?.trim() || this.isStoredKeyActive())
    ) {
      resolved = `openrouter/${resolved}`;
    }

    return ['--model', resolved];
  }

  /**
   * Returns true when a manually-stored key is the only credential source
   * (meaning the user pasted an OpenRouter key via the auth modal).
   */
  private isStoredKeyActive(): boolean {
    return !hasEnvApiKey() && this.getStoredApiKey() !== null;
  }

  private static readonly LIST_MODELS_TIMEOUT_MS = 15_000;

  /**
   * Env vars injected into every opencode subprocess to ensure fully
   * non-interactive, yolo-mode execution.
   */
  private static readonly YOLO_ENV: Record<string, string> = {
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_MODELS_FETCH: '1',
    OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
    OPENCODE_DISABLE_PRUNE: '1',
  };

  private static readonly YOLO_CONFIG: Record<string, unknown> = {
    permission: 'allow',
    autoupdate: false,
    share: 'disabled',
  };

  /**
   * OPENCODE_CONFIG_CONTENT is the highest-precedence config source. It may
   * already contain MCP servers injected at startup, so merge yolo defaults
   * instead of replacing it.
   */
  private static applyYoloConfigContent(env: NodeJS.ProcessEnv): void {
    let existing: Record<string, unknown> = {};
    try {
      if (env.OPENCODE_CONFIG_CONTENT) {
        const parsed = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existing = parsed as Record<string, unknown>;
        }
      }
    } catch {
      existing = {};
    }

    env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
      ...existing,
      ...OpencodeStrategy.YOLO_CONFIG,
    });
  }

  private buildOpencodeEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...this.getProxyEnv(),
      ...OpencodeStrategy.YOLO_ENV,
    };
    OpencodeStrategy.applyYoloConfigContent(env);
    const storedKey = this.getStoredApiKey();

    if (storedKey) {
      for (const varName of API_KEY_ENV_VARS) {
        if (!env[varName]?.trim()) {
          env[varName] = storedKey;
        }
      }
      if (!env['OPENAI_API_BASE']?.trim()) {
        env['OPENAI_API_BASE'] = 'https://openrouter.ai/api/v1';
      }
    }

    return env;
  }

  listModels(): Promise<string[]> {
    return new Promise((resolve) => {
      const env = this.buildOpencodeEnv();

      let stdout = '';
      const proc = spawn('opencode', ['models'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        proc.kill();
        this.logger.warn('opencode models timed out');
        resolve([]);
      }, OpencodeStrategy.LIST_MODELS_TIMEOUT_MS);

      proc.stdout?.on('data', (data: Buffer | string) => {
        stdout += data.toString();
      });

      proc.on('close', () => {
        clearTimeout(timer);
        const models = stdout
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        resolve(models);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        this.logger.warn('opencode models failed', err.message);
        resolve([]);
      });
    });
  }

  override interruptAgent(): void {
    this.streamInterrupted = true;
    this.activeSseAbort?.abort();
    this.activePromptAbort?.abort();
    const appServer = this.appServer;
    const sessionId = this.activeAppServerSessionId;
    if (appServer && sessionId) {
      void appServer.json(`/session/${encodeURIComponent(sessionId)}/abort`, {
        method: 'POST',
        query: this.appServerQuery(),
        timeoutMs: 5_000,
      }).catch(() => undefined);
    } else {
      this.shutdownAppServer();
    }
    this.currentStreamProcess?.kill();
  }

  override steerAgent(message: string): void {
    const trimmed = message.trim();
    if (!trimmed) return;
    // OpenCode serve does not expose Codex-style turn steering. Preserve the
    // user intent and let the orchestrator's queued empty turn deliver it next.
    this.pendingSteerMessages.push(trimmed);
  }

  /**
   * Ensure the workspace has a permissive opencode.json so the CLI
   * never prompts for permission (external_directory, bash, edit, etc.).
   */
  private ensureYoloConfig(workspaceDir: string): void {
    const configPath = join(workspaceDir, OPENCODE_CONFIG_FILE);
    try {
      if (!existsSync(configPath)) {
        writeFileSync(configPath, YOLO_CONFIG, { mode: 0o644 });
        this.logger.log('Wrote yolo opencode.json config');
      }
    } catch (err) {
      this.logger.warn('Failed to write opencode.json config', (err as Error).message);
    }
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
    return this.executePromptStreamingRun(prompt, model, onChunk, callbacks, systemPrompt);
  }

  private executePromptStreamingRun(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    systemPrompt?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.streamInterrupted = false;
      const workspaceDir = this.getOpencodeWorkspaceDir();
      this.prepareWorkingDir();

      // Write permissive opencode.json so external_directory, bash, edit
      // etc. are all auto-approved (yolo mode)
      this.ensureYoloConfig(workspaceDir);

      const hasSession = this.readStoredSession() !== null;

      const pendingMessages = this.consumePendingMessages();
      let finalPrompt = prompt;
      if (pendingMessages) {
        finalPrompt = `[Operator Interruption]\n${pendingMessages}\n\n${prompt}`;
      }
      const effectivePrompt = systemPrompt ? `${systemPrompt}\n${finalPrompt}` : finalPrompt;
      const opencodeArgs = buildOpencodeRunArgs(effectivePrompt, this.getModelArgs(model), hasSession);

      // Build env: start with process.env (inherits pre-set keys like
      // ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, etc.).
      // Merge in YOLO_ENV to ensure non-interactive execution.
      // If a manual key was stored via the auth modal, inject it into
      // all common env vars so opencode can use any provider.
      const env = this.buildOpencodeEnv();
      const storedKey = this.getStoredApiKey();

      if (!hasEnvApiKey() && !storedKey) {
        reject(new Error('Not authenticated. Please provide an API key first.'));
        return;
      }

      this.logger.log(`Spawning opencode: model=${model || '(default)'}`);

      const opencodeProcess = spawn('opencode', opencodeArgs, {
        env,
        cwd: workspaceDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.currentStreamProcess = opencodeProcess;

      let errorResult = '';
      let lineBuffer = '';
      let hasEmittedOutput = false;

      /** Strip ANSI escape sequences so sidebar output is clean. */
      // eslint-disable-next-line no-control-regex
      const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');

      opencodeProcess.stdout?.on('data', (data: Buffer | string) => {
        // OpenCode --format json outputs NDJSON (one JSON object per line)
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed) as {
              type: string;
              error?: { name?: string; data?: { message?: string } };
              part?: {
                type?: string;
                text?: string;
                name?: string;
                summary?: string;
                path?: string;
              };
            };

            switch (event.type) {
              case 'text':
                if (event.part?.text) {
                  if (event.part.text.trim()) hasEmittedOutput = true;
                  onChunk(event.part.text);
                }
                break;
              case 'tool_call':
                if (callbacks?.onTool && event.part) {
                  hasEmittedOutput = true;
                  callbacks.onTool({
                    kind: 'tool_call',
                    name: event.part.name ?? 'tool',
                    path: event.part.path,
                    summary: event.part.summary,
                    details: JSON.stringify(event.part),
                  });
                }
                break;
              case 'step_start':
                hasEmittedOutput = true;
                callbacks?.onReasoningChunk?.('Thinking…\n');
                break;
              case 'thinking':
                if (event.part?.text && callbacks?.onReasoningChunk) {
                  hasEmittedOutput = true;
                  callbacks.onReasoningChunk(event.part.text);
                }
                break;
              case 'step_finish':
                hasEmittedOutput = true;
                callbacks?.onReasoningEnd?.();
                break;
              case 'error': {
                const msg = event.error?.data?.message
                  ?? event.error?.name
                  ?? 'Unknown opencode error';
                errorResult += msg;
                onChunk(`⚠️ ${msg}`);
                break;
              }
              default:
                // Other event types (e.g. tool_result) — ignore
                break;
            }
          } catch {
            // Non-JSON line — pass through as raw text
            if (trimmed) hasEmittedOutput = true;
            onChunk(trimmed);
          }
        }
      });

      opencodeProcess.stderr?.on('data', (data: Buffer | string) => {
        const text = stripAnsi(data.toString());
        errorResult += text;
        if (callbacks?.onReasoningChunk) {
          callbacks.onReasoningChunk(text);
        }
      });

      opencodeProcess.on('close', (code) => {
        this.currentStreamProcess = null;
        if (lineBuffer.trim()) {
          try {
            const event = JSON.parse(lineBuffer.trim()) as {
              type: string;
              part?: { text?: string };
            };
            if (event.type === 'text' && event.part?.text) {
              if (event.part.text.trim()) hasEmittedOutput = true;
              onChunk(event.part.text);
             }
          } catch {
            if (lineBuffer.trim()) hasEmittedOutput = true;
            onChunk(lineBuffer.trim());
          }
        }

        callbacks?.onReasoningEnd?.();
        if (this.streamInterrupted) {
          reject(new Error(INTERRUPTED_MESSAGE));
          return;
        }
        const shouldInspectFailure = (code !== 0 && code !== null) || !hasEmittedOutput || Boolean(errorResult.trim());
        if (shouldInspectFailure) {
          const authError = detectProviderAuthFailure('OpenCode', errorResult);
          if (authError) {
            reject(authError);
            return;
          }
        }
        if ((code === 0 || code === null) && !hasEmittedOutput) {
          this.clearStoredSession();
          reject(new Error(errorResult.trim() || 'Agent process completed successfully but returned no output. Session not saved to prevent corruption.'));
          return;
        }
        if (code !== 0 && code !== null) {
          if (missingSessionError(errorResult)) {
            this.clearStoredSession();
          }
          reject(new Error(errorResult.trim() || `Process exited with code ${code}`));
        } else {
          this.writeStoredSession('legacy');
          resolve();
        }
      });

      opencodeProcess.on('error', (err) => {
        this.currentStreamProcess = null;
        this.logger.error('OpenCode process error', err);
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
    this.prepareWorkingDir();
    const workspaceDir = this.getWorkingDir();
    this.ensureYoloConfig(workspaceDir);

    const storedKey = this.getStoredApiKey();
    if (!hasEnvApiKey() && !storedKey) {
      throw new Error('Not authenticated. Please provide an API key first.');
    }

    const pendingMessages = this.consumePendingMessages();
    let finalPrompt = prompt;
    if (pendingMessages) {
      finalPrompt = `[Operator Interruption]\n${pendingMessages}\n\n${prompt}`;
    }

    const appServer = this.createAppServer();
    this.appServer = appServer;
    const state: OpenCodeEventState = {
      sessionId: '',
      onChunk,
      callbacks,
      errorResult: '',
      reasoningOpen: false,
      hasVisibleOutput: false,
      textByPartId: new Map(),
      rawTextByPartId: new Map(),
      partTypeById: new Map(),
      emittedToolStateByPartId: new Map(),
      messageRoleById: new Map(),
    };

    let eventStream: { stop: () => void; done: Promise<void> } | null = null;
    let existingSessionId = this.readStoredSession();
    try {
      await appServer.start();
      eventStream = await this.openAppServerEventStream(appServer, state);
      const sessionId = await this.ensureAppServerSession(appServer, existingSessionId);
      state.sessionId = sessionId;
      this.activeAppServerSessionId = sessionId;

      const response = await this.postAppServerMessage(
        appServer,
        sessionId,
        finalPrompt,
        model,
        systemPrompt,
        runtimeOptions,
      );
      for (const part of response.parts ?? []) this.handleOpenCodePart(state, part);
      this.handleOpenCodeMessageInfo(state, response.info);
      this.endReasoning(state);

      if (this.streamInterrupted) throw new Error(INTERRUPTED_MESSAGE);
      if (state.errorResult.trim()) {
        const authError = detectProviderAuthFailure('OpenCode', state.errorResult);
        if (authError) throw authError;
      }
      if (!state.hasVisibleOutput) {
        this.clearStoredSession();
        throw new Error(state.errorResult.trim() || 'Agent process completed successfully but returned no output. Session not saved to prevent corruption.');
      }
      this.writeStoredSession(sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const authError = detectProviderAuthFailure('OpenCode', message);
      if (authError) throw authError;
      if (existingSessionId && missingSessionError(message)) {
        this.clearStoredSession();
        existingSessionId = null;
      }
      throw err;
    } finally {
      eventStream?.stop();
      await eventStream?.done.catch(() => undefined);
      this.activeSseAbort = null;
      this.activePromptAbort = null;
      this.activeAppServerSessionId = null;
      this.shutdownAppServer();
    }
  }

  private createAppServer(): HttpAppServerProcess {
    return new HttpAppServerProcess(
      'opencode',
      (port) => [
        'serve',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
        '--log-level',
        'ERROR',
      ],
      {
        env: this.buildOpencodeEnv(),
        cwd: this.getWorkingDir(),
        logger: this.logger,
        healthPath: '/global/health',
        startupTimeoutMs: 20_000,
        requestTimeoutMs: OPENCODE_APP_SERVER_REQUEST_TIMEOUT_MS,
      },
    );
  }

  private appServerQuery(): Record<string, string> {
    return { directory: this.getWorkingDir() };
  }

  private async ensureAppServerSession(appServer: HttpAppServerProcess, existingSessionId: string | null): Promise<string> {
    if (existingSessionId?.startsWith('ses_')) {
      try {
        const session = await appServer.json<OpenCodeSession>(
          `/session/${encodeURIComponent(existingSessionId)}`,
          { query: this.appServerQuery() },
        );
        return session.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!missingSessionError(message) && !message.includes('404')) throw err;
        this.clearStoredSession();
        throw err;
      }
    }

    const session = await appServer.json<OpenCodeSession>('/session', {
      method: 'POST',
      query: this.appServerQuery(),
      body: {
        title: `Fibe ${this.conversationDataDir?.getConversationId?.() ?? 'conversation'}`,
        permission: OPENCODE_SESSION_PERMISSION_ALLOW_ALL,
      },
    });
    this.writeStoredSession(session.id);
    return session.id;
  }

  private async postAppServerMessage(
    appServer: HttpAppServerProcess,
    sessionId: string,
    prompt: string,
    model: string,
    systemPrompt?: string,
    runtimeOptions?: AgentRuntimeOptions,
  ): Promise<OpenCodeMessageResponse> {
    const controller = new AbortController();
    this.activePromptAbort = controller;
    const resolvedModel = this.resolveModelForApi(model);
    const body: Record<string, unknown> = {
      parts: [{ type: 'text', text: prompt }],
    };
    const parsedModel = parseOpencodeModel(resolvedModel);
    if (parsedModel) body.model = parsedModel;
    if (systemPrompt) body.system = systemPrompt;
    const variant = normalizeVariant(runtimeOptions?.effort);
    if (variant) body.variant = variant;

    return await appServer.json<OpenCodeMessageResponse>(
      `/session/${encodeURIComponent(sessionId)}/message`,
      {
        method: 'POST',
        query: this.appServerQuery(),
        body,
        signal: controller.signal,
        timeoutMs: OPENCODE_APP_SERVER_TURN_TIMEOUT_MS,
      },
    );
  }

  private resolveModelForApi(model: string): string {
    const args = this.getModelArgs(model);
    const modelIndex = args.indexOf('--model');
    if (modelIndex >= 0 && args[modelIndex + 1]) return args[modelIndex + 1];
    return model;
  }

  private async openAppServerEventStream(
    appServer: HttpAppServerProcess,
    state: OpenCodeEventState,
  ): Promise<{ stop: () => void; done: Promise<void> }> {
    const controller = new AbortController();
    this.activeSseAbort = controller;
    const res = await fetch(appServer.url('/event', this.appServerQuery()), {
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`OpenCode event stream failed with ${res.status}: ${body}`);
      throw new Error(`OpenCode event stream failed with ${res.status}: ${body}`);
    }

    const done = this.consumeAppServerEvents(res, state, controller.signal).catch((err) => {
      if (!controller.signal.aborted) {
        this.logger.warn(`OpenCode event stream ended unexpectedly: ${err}`);
      }
    });

    return {
      stop: () => controller.abort(),
      done,
    };
  }

  private async consumeAppServerEvents(
    response: Response,
    state: OpenCodeEventState,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';

    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        this.handleOpenCodeEvent(state, trimmed.slice('data:'.length).trim());
      }
    }
  }

  private handleOpenCodeEvent(state: OpenCodeEventState, data: string): void {
    if (!data) return;
    let event: OpenCodeEvent;
    try {
      event = JSON.parse(data) as OpenCodeEvent;
    } catch {
      return;
    }
    const props = event.properties ?? {};

    switch (event.type) {
      case 'message.updated':
        this.handleOpenCodeMessageInfo(state, props.info as OpenCodeMessage | undefined);
        break;
      case 'message.part.updated':
        if (props.part) this.handleOpenCodePart(state, props.part);
        break;
      case 'message.part.delta':
        this.handleOpenCodePartDelta(state, props);
        break;
      case 'session.error':
        if (props.sessionID === state.sessionId && props.error) {
          const msg = errorMessage(props.error);
          state.errorResult += msg;
          state.onChunk(`⚠️ ${msg}`);
        }
        break;
      case 'session.idle':
        if (props.sessionID === state.sessionId) this.endReasoning(state);
        break;
      default:
        break;
    }
  }

  private handleOpenCodeMessageInfo(state: OpenCodeEventState, info?: OpenCodeMessage): void {
    if (!info || info.sessionID !== state.sessionId) return;
    // Track the role of each message so we can skip user-message text parts
    if (info.id && info.role) state.messageRoleById.set(info.id, info.role);
    if (info.error) {
      const msg = errorMessage(info.error);
      state.errorResult += msg;
      state.onChunk(`⚠️ ${msg}`);
    }
    if (info.role === 'assistant' && info.tokens && state.callbacks?.onUsage) {
      state.callbacks.onUsage(this.tokensFrom(info.tokens));
    }
  }

  private handleOpenCodePart(state: OpenCodeEventState, part: OpenCodePart): void {
    if (part.sessionID !== state.sessionId) return;
    state.partTypeById.set(part.id, part.type);
    // Track message role when we first see a part so we can filter by it
    // (messageID on the part is the parent message; we may not have seen its message.updated yet)

    switch (part.type) {
      case 'text': {
        // Skip user-message text parts — opencode echoes the user's question as a text part.
        // Guard 1: role map (populated by message.updated events)
        const parentRole = state.messageRoleById.get(part.messageID);
        if (parentRole === 'user') break;
        // Guard 2: user parts always start with [MODE] — assistant response parts never do
        if ((part.text ?? '').startsWith('[MODE]')) break;
        this.emitPartTextDelta(state, part, 'assistant');
        break;
      }
      case 'reasoning':
        this.emitPartTextDelta(state, part, 'reasoning');
        break;
      case 'tool':
        this.emitToolPart(state, part);
        break;
      case 'step-start':
        this.startReasoning(state);
        state.hasVisibleOutput = true;
        break;
      case 'step-finish':
        if (part.tokens && state.callbacks?.onUsage) {
          state.callbacks.onUsage(this.tokensFrom(part.tokens));
        }
        this.endReasoning(state);
        state.hasVisibleOutput = true;
        break;
      default:
        break;
    }
  }

  private handleOpenCodePartDelta(
    state: OpenCodeEventState,
    props: NonNullable<OpenCodeEvent['properties']>,
  ): void {
    if (props.sessionID !== state.sessionId || props.field !== 'text' || !props.partID || !props.delta) return;
    const partType = state.partTypeById.get(props.partID);

    // Skip deltas for user-message parts (echoed question text)
    const parentRole = props.messageID ? state.messageRoleById.get(props.messageID) : undefined;
    if (parentRole === 'user') return;

    // Accumulate raw text, then strip MODE tags to find what's cleanly emittable
    const rawAccumulated = (state.rawTextByPartId.get(props.partID) ?? '') + props.delta;
    state.rawTextByPartId.set(props.partID, rawAccumulated);

    // Guard 2: if accumulated text starts with [MODE], this is a user-message part — skip entirely
    if (rawAccumulated.startsWith('[MODE]')) {
      // Still hold back until we see a [/MODE] in case the text transitions to assistant content
      if (!rawAccumulated.includes('[/MODE]')) return;
      // After [/MODE], there's nothing useful (it's the user message); skip
      return;
    }

    // Strip any remaining [MODE]...[/MODE] blocks and emit only new clean content
    // hold the text after the last complete [/MODE] — or hold everything if still inside a block.
    let clean = rawAccumulated;
    const modeEnd = rawAccumulated.lastIndexOf('[/MODE]');
    if (modeEnd >= 0) {
      // Emit only what's after the last complete [/MODE]
      clean = rawAccumulated.slice(modeEnd + '[/MODE]'.length).trimStart();
    } else if (rawAccumulated.includes('[MODE]')) {
      // We're mid-MODE block — hold everything back
      return;
    }

    const previousClean = state.textByPartId.get(props.partID) ?? '';
    if (previousClean.startsWith(clean)) return;
    const delta = clean.startsWith(previousClean) ? clean.slice(previousClean.length) : clean;
    state.textByPartId.set(props.partID, clean);

    if (!delta) return;
    state.hasVisibleOutput = true;
    if (partType === 'reasoning') {
      this.startReasoning(state);
      state.callbacks?.onReasoningChunk?.(delta);
    } else {
      state.onChunk(delta);
    }
  }

  private emitPartTextDelta(state: OpenCodeEventState, part: OpenCodePart, target: 'assistant' | 'reasoning'): void {
    // Strip any stray [MODE]...[/MODE] context markers (shouldn't reach here after guards, but belt-and-suspenders)
    const rawText = part.text ?? '';
    const text = rawText.replace(/\[MODE\][\s\S]*?\[\/MODE\]/g, '').trimStart();
    const previous = state.textByPartId.get(part.id) ?? '';
    const delta = text.startsWith(previous) ? text.slice(previous.length) : text;
    state.textByPartId.set(part.id, text);
    if (!delta) return;
    state.hasVisibleOutput = true;
    if (target === 'reasoning') {
      this.startReasoning(state);
      state.callbacks?.onReasoningChunk?.(delta);
    } else {
      state.onChunk(delta);
    }
  }

  private emitToolPart(state: OpenCodeEventState, part: OpenCodePart): void {
    const serialized = JSON.stringify(part.state ?? part);
    if (state.emittedToolStateByPartId.get(part.id) === serialized) return;
    state.emittedToolStateByPartId.set(part.id, serialized);
    state.hasVisibleOutput = true;
    const toolEvent: ToolEvent = {
      kind: 'tool_call',
      name: part.tool ?? part.state?.title ?? 'tool',
      summary: part.state?.title ?? part.state?.status,
      details: JSON.stringify(part),
    };
    state.callbacks?.onTool?.(toolEvent);
  }

  private startReasoning(state: OpenCodeEventState): void {
    if (state.reasoningOpen) return;
    state.reasoningOpen = true;
    state.callbacks?.onReasoningStart?.();
  }

  private endReasoning(state: OpenCodeEventState): void {
    if (!state.reasoningOpen) return;
    state.reasoningOpen = false;
    state.callbacks?.onReasoningEnd?.();
  }

  private tokensFrom(tokens: NonNullable<OpenCodeMessage['tokens']>): TokenUsage {
    return {
      inputTokens: tokens.input ?? 0,
      outputTokens: tokens.output ?? 0,
    };
  }

  private shutdownAppServer(): void {
    this.appServer?.close();
    this.appServer = null;
  }

  hasNativeSessionSupport(): boolean {
    return true;
  }
}
