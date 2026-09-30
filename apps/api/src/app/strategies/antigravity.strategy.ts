import { spawn } from 'node:child_process';
import * as pty from 'node-pty';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { detectProviderAuthFailure } from '@shared/provider-auth-errors';
import type {
  AuthConnection,
  AgentRuntimeOptions,
  ConversationDataDirProvider,
  LogoutConnection,
  SteerAgentResult,
  StreamingCallbacks,
} from './strategy.types';
import { INTERRUPTED_MESSAGE } from './strategy.types';
import { AbstractCLIStrategy } from './abstract-cli.strategy';
import { buildProviderArgs, type ProviderArgsConfig } from './provider-args';
import { ProviderConversationPaths } from './provider-conversation-paths';

const DEFAULT_ANTIGRAVITY_GEMINI_DIR = join(
  process.env.HOME ?? '/home/node',
  '.gemini',
);
const ANTIGRAVITY_WORKSPACE_SUBDIR = 'antigravity_workspace';
const SESSION_MARKER_FILE = '.antigravity_session';
const ANTIGRAVITY_BIN_NAME = process.platform === 'win32' ? 'agy.exe' : 'agy';
const AUTH_PROMPT =
  'Authenticate Antigravity CLI and respond with "authenticated".';
const AUTH_TIMEOUT = '5m';

const ANTIGRAVITY_PROVIDER_ARGS_CONFIG: ProviderArgsConfig = {
  defaultArgs: {
    '--print-timeout': '30m',
  },
  blockedArgs: {
    '--print': false,
    '--prompt': false,
    '-p': false,
    '--prompt-interactive': false,
    '-i': false,
    '--continue': false,
    '-c': false,
    '--conversation': false,
    '--input-format': false,
    '--output-format': 'stream-json',
    '--dangerously-skip-permissions': true,
    '--sandbox': true,
  },
};

const GOOGLE_OAUTH_URL_REGEX =
  /https:\/\/accounts\.google\.com\/o\/oauth2\/[^\s"'<>]+/;
const MISSING_CONVERSATION_REGEX =
  /Warning:\s*conversation\s+"([^"]+)"\s+not found\./i;
const AUTH_FAILURE_REGEX =
  /(?:authentication timed out|authentication failed|failed to authenticate|Error:\s*authentication)/i;

function getAntigravityGeminiDir(): string {
  return (
    process.env.ANTIGRAVITY_HOME?.trim() ||
    process.env.SESSION_DIR?.trim() ||
    DEFAULT_ANTIGRAVITY_GEMINI_DIR
  );
}

function getAntigravityCommand(): string {
  if (process.env.ANTIGRAVITY_BIN?.trim())
    return process.env.ANTIGRAVITY_BIN.trim();
  return ANTIGRAVITY_BIN_NAME;
}

function getHomeRootForGeminiDir(geminiDir: string): string {
  const normalized = resolve(geminiDir);
  if (basename(normalized) === 'antigravity-cli')
    return dirname(dirname(normalized));
  if (basename(normalized) === '.gemini') return dirname(normalized);
  return process.env.HOME ?? dirname(normalized);
}

function getAntigravityDataDir(geminiDir: string): string {
  const normalized = resolve(geminiDir);
  if (basename(normalized) === 'antigravity-cli') return normalized;
  return join(normalized, 'antigravity-cli');
}

function getLastConversationsPath(geminiDir: string): string {
  return join(
    getAntigravityDataDir(geminiDir),
    'cache',
    'last_conversations.json',
  );
}

function hasAntigravityKeyringState(geminiDir: string): boolean {
  const keyringDir = join(geminiDir, '.local', 'share', 'keyrings');
  if (!existsSync(keyringDir)) return false;

  try {
    return readdirSync(keyringDir).some(
      (name) => statSync(join(keyringDir, name)).size > 0,
    );
  } catch {
    return false;
  }
}

export function buildAntigravityArgs(
  prompt: string,
  sessionId: string | null,
  model = '',
  effort?: string,
): string[] {
  const normalizedModel = model.trim();
  const normalizedEffort = effort?.trim().toLowerCase();
  const providerTokens = buildProviderArgs({
    ...ANTIGRAVITY_PROVIDER_ARGS_CONFIG,
    blockedArgs: {
      ...ANTIGRAVITY_PROVIDER_ARGS_CONFIG.blockedArgs,
      ...(normalizedModel && normalizedModel !== 'undefined'
        ? { '--model': false, '-m': false }
        : {}),
      ...(normalizedEffort ? { '--effort': false } : {}),
    },
  });
  const args = [...providerTokens];
  if (normalizedModel && normalizedModel !== 'undefined')
    args.push('--model', normalizedModel);
  if (
    normalizedEffort &&
    ['low', 'medium', 'high', 'xhigh', 'max'].includes(normalizedEffort)
  ) {
    args.push(
      '--effort',
      ['xhigh', 'max'].includes(normalizedEffort) ? 'high' : normalizedEffort,
    );
  }
  if (sessionId) args.push('--conversation', sessionId);
  args.push(`--prompt=${prompt}`);
  return args;
}

export class AntigravityStrategy extends AbstractCLIStrategy {
  private readonly paths: ProviderConversationPaths;
  private authTerminal: pty.IPty | null = null;

  constructor(
    useApiTokenMode = false,
    conversationDataDir?: ConversationDataDirProvider,
  ) {
    super(AntigravityStrategy.name, useApiTokenMode, conversationDataDir);
    this.paths = new ProviderConversationPaths({
      conversationDataDir,
      workspaceSubdir: ANTIGRAVITY_WORKSPACE_SUBDIR,
      fallbackWorkspaceDir: join(process.cwd(), ANTIGRAVITY_WORKSPACE_SUBDIR),
      sessionMarkerFile: SESSION_MARKER_FILE,
    });
  }

  getWorkingDir(): string {
    return this.paths.getWorkspaceDir();
  }

  prepareWorkingDir(): void {
    this.paths.prepareWorkspace();
  }

  private getApiKey(): string | null {
    const fromEnv =
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim();
    if (fromEnv) return fromEnv;
    try {
      const saved = JSON.parse(
        readFileSync(join(this.getGeminiDirForSession(), 'auth.json'), 'utf8'),
      );
      return typeof saved.api_key === 'string'
        ? saved.api_key.trim() || null
        : null;
    } catch {
      return null;
    }
  }

  ensureSettings(): void {
    const dataDir = getAntigravityDataDir(this.getGeminiDirForSession());
    mkdirSync(join(dataDir, 'cache'), { recursive: true });
    const settingsPath = join(dataDir, 'settings.json');
    let settings: Record<string, unknown> = {};
    if (existsSync(settingsPath))
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    if (this.useApiTokenMode && this.getApiKey()) {
      settings.modelProvider = 'gemini';
    } else if (settings.modelProvider === 'gemini') {
      delete settings.modelProvider;
    }
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });
  }

  getModelArgs(model: string): string[] {
    return model.trim() && model !== 'undefined'
      ? ['--model', model.trim()]
      : [];
  }

  listModels(): Promise<string[]> {
    this.ensureSettings();
    return new Promise((resolveModels) => {
      const proc = spawn(getAntigravityCommand(), ['models'], {
        env: this.getAntigravityProcessEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      const timer = setTimeout(() => {
        proc.kill();
        resolveModels([]);
      }, 15_000);
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        const models =
          code === 0
            ? this.stripAnsi(output)
                .split(/\r?\n/)
                .map((line) => line.trim().split(/\s+/)[0])
                .filter(
                  (slug) =>
                    /^[a-z0-9][a-z0-9._/-]*$/.test(slug) && slug !== 'model',
                )
            : [];
        resolveModels([...new Set(models)]);
      });
      proc.on('error', () => {
        clearTimeout(timer);
        resolveModels([]);
      });
    });
  }

  hasNativeSessionSupport(): boolean {
    return this.readSessionId() !== null;
  }

  executeAuth(connection: AuthConnection): void {
    this.cancelAuth();
    this.currentConnection = connection;
    if (this.useApiTokenMode) {
      if (this.getApiKey()) connection.sendAuthSuccess();
      else connection.sendAuthManualToken();
      return;
    }
    this.ensureSettings();
    this.prepareWorkingDir();
    // agy reads OAuth codes from /dev/tty; ordinary child-process pipes cannot
    // complete its remote sign-in flow. Keep the terminal scoped to this run.
    try {
      const terminal = pty.spawn(
        getAntigravityCommand(),
        [`--prompt=${AUTH_PROMPT}`, '--print-timeout', AUTH_TIMEOUT],
        {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: this.getWorkingDir(),
          env: Object.fromEntries(
            Object.entries(this.getAntigravityProcessEnv()).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === 'string',
            ),
          ),
        },
      );
      this.authTerminal = terminal;
      let output = '';
      let authUrlExtracted = false;
      const timer = setTimeout(() => terminal.kill(), 360_000);
      this.authCancel = () => {
        clearTimeout(timer);
        terminal.kill();
        this.authTerminal = null;
      };
      terminal.onData((text) => {
        output += text;
        const match = this.stripAnsi(output).match(GOOGLE_OAUTH_URL_REGEX);
        if (match && !authUrlExtracted) {
          authUrlExtracted = true;
          this.currentConnection?.sendAuthUrlGenerated(match[0]);
        }
      });
      terminal.onExit(({ exitCode }) => {
        clearTimeout(timer);
        if (this.authTerminal !== terminal) return;
        this.authTerminal = null;
        this.authCancel = null;
        const activeConnection = this.currentConnection;
        this.currentConnection = null;
        if (
          exitCode !== 0 ||
          AUTH_FAILURE_REGEX.test(output) ||
          detectProviderAuthFailure('Antigravity', output)
        ) {
          activeConnection?.sendAuthStatus('unauthenticated');
        } else {
          activeConnection?.sendAuthSuccess();
        }
      });
    } catch (err) {
      this.currentConnection = null;
      connection.sendError((err as Error).message);
      connection.sendAuthStatus('unauthenticated');
    }
  }

  submitAuthCode(code: string): void {
    const trimmed = (code ?? '').trim();
    if (!trimmed) {
      this.currentConnection?.sendAuthStatus('unauthenticated');
      return;
    }
    if (this.useApiTokenMode) {
      const geminiDir = this.getGeminiDirForSession();
      mkdirSync(geminiDir, { recursive: true });
      writeFileSync(
        join(geminiDir, 'auth.json'),
        JSON.stringify({ api_key: trimmed }),
        { mode: 0o600 },
      );
      this.ensureSettings();
      this.currentConnection?.sendAuthSuccess();
      this.currentConnection = null;
    } else {
      this.authTerminal?.write(`${trimmed}\r`);
    }
  }

  clearCredentials(): void {
    rmSync(getAntigravityDataDir(this.getGeminiDirForSession()), {
      recursive: true,
      force: true,
    });
    rmSync(join(this.getGeminiDirForSession(), '.local', 'share', 'keyrings'), {
      recursive: true,
      force: true,
    });
    this.clearCredentialMarker();
    this.paths.clearSessionMarker();
  }

  executeLogout(connection: LogoutConnection): void {
    this.clearCredentials();
    connection.sendLogoutSuccess();
  }

  checkAuthStatus(): Promise<boolean> {
    return Promise.resolve(
      this.useApiTokenMode
        ? Boolean(this.getApiKey())
        : this.hasAntigravityConversationState(),
    );
  }

  executePromptStreaming(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    systemPrompt?: string,
    runtimeOptions?: AgentRuntimeOptions,
  ): Promise<void> {
    this.streamInterrupted = false;
    this.ensureSettings();
    this.prepareWorkingDir();
    const sessionId = this.readSessionId();
    const args = buildAntigravityArgs(
      this.buildPromptWithPending(prompt, systemPrompt),
      sessionId,
      model,
      runtimeOptions?.effort,
    );
    return new Promise((resolvePrompt, reject) => {
      const proc = spawn(getAntigravityCommand(), args, {
        env: this.getAntigravityProcessEnv(),
        cwd: this.getWorkingDir(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.currentStreamProcess = proc;
      let lineBuffer = '';
      let stderr = '';
      let result: {
        status?: string;
        response?: string;
        error?: string;
        conversation_id?: string;
      } | null = null;
      let emittedText = '';
      let parseError = false;
      let authUrlEmitted = false;
      let diagnosticsStarted = false;
      const usage = (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        const counts = value as Record<string, number>;
        callbacks?.onUsage?.({
          inputTokens: counts.input_tokens ?? 0,
          outputTokens: counts.output_tokens ?? 0,
        });
      };
      const readLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line);
          if (event.event === 'step_update') {
            const step = event.step_update ?? {};
            if (
              step.step_type === 'agent_response' &&
              typeof step.text_delta === 'string'
            ) {
              emittedText += step.text_delta;
              onChunk(step.text_delta);
            }
            if (step.step_type === 'tool') {
              const info = step.tool_info ?? {};
              const parameters = info.parameters ?? {};
              callbacks?.onTool?.({
                kind: 'tool_call',
                name: info.name || step.tool_name || 'tool',
                command: parameters.CommandLine,
                path: parameters.TargetFile || parameters.AbsolutePath,
                details: JSON.stringify(parameters),
                summary: info.output || info.error?.message,
              });
            }
            callbacks?.onStep?.({
              id: `antigravity-${step.step_index}`,
              title: step.tool_name || step.step_type || 'Antigravity',
              status: step.state === 'DONE' ? 'complete' : 'processing',
              timestamp: new Date(),
            });
          } else if (event.event === 'result') {
            result = event.result;
            usage(event.result?.usage);
          }
        } catch {
          parseError = true;
        }
      };
      proc.stdout?.on('data', (data) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        lines.forEach(readLine);
      });
      proc.stderr?.on('data', (data) => {
        const diagnostic = this.stripAnsi(data.toString());
        stderr += diagnostic;
        if (diagnostic.trim() && callbacks?.onReasoningChunk) {
          if (!diagnosticsStarted) {
            diagnosticsStarted = true;
            callbacks.onReasoningStart?.();
          }
          callbacks.onReasoningChunk(diagnostic);
        }
        const match = stderr.match(GOOGLE_OAUTH_URL_REGEX);
        if (match && !authUrlEmitted) {
          authUrlEmitted = true;
          callbacks?.onAuthRequired?.(match[0]);
        }
      });
      proc.on('error', (err) => {
        if (diagnosticsStarted) callbacks?.onReasoningEnd?.();
        this.currentStreamProcess = null;
        reject(err);
      });
      proc.on('close', (code) => {
        if (diagnosticsStarted) callbacks?.onReasoningEnd?.();
        this.currentStreamProcess = null;
        if (lineBuffer.trim()) readLine(lineBuffer);
        if (this.streamInterrupted) {
          reject(new Error(INTERRUPTED_MESSAGE));
          return;
        }
        const outcome = result as typeof result;
        const failure = [outcome?.error, stderr].filter(Boolean).join('\n');
        const authError = detectProviderAuthFailure('Antigravity', failure);
        if (authError || AUTH_FAILURE_REGEX.test(failure)) {
          this.clearAuthStatusMarkers();
          reject(
            authError ||
              new Error(
                'Authentication required. Please sign in with Google Antigravity.',
              ),
          );
          return;
        }
        if (
          this.missingSessionError(failure) ||
          MISSING_CONVERSATION_REGEX.test(failure)
        ) {
          this.paths.clearSessionMarker();
          reject(
            new Error(
              `Stored Antigravity conversation was not found. Retry to start a fresh provider conversation.`,
            ),
          );
          return;
        }
        if (
          code !== 0 ||
          !outcome ||
          outcome.status !== 'SUCCESS' ||
          parseError
        ) {
          reject(
            new Error(
              failure ||
                `Antigravity did not complete successfully (${outcome?.status || code || 'missing result'}).`,
            ),
          );
          return;
        }
        const response =
          typeof outcome.response === 'string' ? outcome.response : '';
        if (!response.trim()) {
          reject(new Error('Antigravity completed without a response.'));
          return;
        }
        // Result.response describes only the current turn. Deltas may have been
        // emitted already; never concatenate the terminal copy a second time.
        if (!emittedText) onChunk(response);
        else if (
          response.startsWith(emittedText) &&
          response.length > emittedText.length
        )
          onChunk(response.slice(emittedText.length));
        if (outcome.conversation_id)
          this.paths.writeSessionMarker(outcome.conversation_id);
        resolvePrompt();
      });
    });
  }

  private getGeminiDirForSession(): string {
    return getAntigravityGeminiDir();
  }

  private getAntigravityProcessEnv(
    extraEnv: NodeJS.ProcessEnv = {},
  ): NodeJS.ProcessEnv {
    const geminiDir = this.getGeminiDirForSession();
    const apiKey = this.useApiTokenMode ? this.getApiKey() : null;
    return {
      ...process.env,
      ...this.getProxyEnv(),
      ...extraEnv,
      HOME: getHomeRootForGeminiDir(geminiDir),
      XDG_CONFIG_HOME:
        process.env.XDG_CONFIG_HOME?.trim() || join(geminiDir, '.config'),
      XDG_DATA_HOME:
        process.env.XDG_DATA_HOME?.trim() || join(geminiDir, '.local', 'share'),
      XDG_STATE_HOME:
        process.env.XDG_STATE_HOME?.trim() ||
        join(geminiDir, '.local', 'state'),
      XDG_CACHE_HOME:
        process.env.XDG_CACHE_HOME?.trim() || join(geminiDir, '.cache'),
      BROWSER: '/bin/true',
      DISPLAY: '',
      NO_BROWSER: 'true',
      ...(apiKey ? { GEMINI_API_KEY: apiKey } : {}),
    };
  }

  private readSessionId(): string | null {
    return this.paths.readSessionMarker();
  }

  override steerAgent(message: string): SteerAgentResult {
    const trimmed = message.trim();
    if (!trimmed) return 'queued';
    this.pendingSteerMessages.push(trimmed);
    return 'queued';
  }

  private hasAntigravityConversationState(): boolean {
    const lastConversations = getLastConversationsPath(
      this.getGeminiDirForSession(),
    );
    if (existsSync(lastConversations)) return true;
    if (existsSync(join(this.getGeminiDirForSession(), 'auth.json')))
      return true;
    if (hasAntigravityKeyringState(this.getGeminiDirForSession())) return true;
    return false;
  }

  private clearCredentialMarker(): void {
    rmSync(join(this.getGeminiDirForSession(), 'auth.json'), { force: true });
  }

  private clearAuthStatusMarkers(): void {
    this.clearCredentialMarker();
    rmSync(getLastConversationsPath(this.getGeminiDirForSession()), {
      force: true,
    });
    rmSync(join(this.getGeminiDirForSession(), '.local', 'share', 'keyrings'), {
      recursive: true,
      force: true,
    });
    this.paths.clearSessionMarker();
  }
}
