import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
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

const DEFAULT_ANTIGRAVITY_GEMINI_DIR = join(process.env.HOME ?? '/home/node', '.gemini');
const ANTIGRAVITY_WORKSPACE_SUBDIR = 'antigravity_workspace';
const SESSION_MARKER_FILE = '.antigravity_session';
const STDOUT_CURSOR_FILE = '.antigravity_stdout';
const ANTIGRAVITY_BIN_NAME = process.platform === 'win32' ? 'agy.exe' : 'agy';
const AUTH_PROMPT = 'Authenticate Antigravity CLI and respond with "authenticated".';
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
    '--dangerously-skip-permissions': true,
    '--sandbox': true,
  },
};

const GOOGLE_OAUTH_URL_REGEX = /https:\/\/accounts\.google\.com\/o\/oauth2\/[^\s"'<>]+/;
const MISSING_CONVERSATION_REGEX = /Warning:\s*conversation\s+"([^"]+)"\s+not found\./i;
const AUTH_FAILURE_REGEX = /(?:authentication timed out|authentication failed|failed to authenticate|Error:\s*authentication)/i;

function getAntigravityGeminiDir(): string {
  return (
    process.env.ANTIGRAVITY_HOME?.trim()
    || process.env.SESSION_DIR?.trim()
    || DEFAULT_ANTIGRAVITY_GEMINI_DIR
  );
}

function getAntigravityCommand(): string {
  if (process.env.ANTIGRAVITY_BIN?.trim()) return process.env.ANTIGRAVITY_BIN.trim();
  return ANTIGRAVITY_BIN_NAME;
}

function getHomeRootForGeminiDir(geminiDir: string): string {
  const normalized = resolve(geminiDir);
  if (basename(normalized) === 'antigravity-cli') return dirname(dirname(normalized));
  if (basename(normalized) === '.gemini') return dirname(normalized);
  return process.env.HOME ?? dirname(normalized);
}

function getAntigravityDataDir(geminiDir: string): string {
  const normalized = resolve(geminiDir);
  if (basename(normalized) === 'antigravity-cli') return normalized;
  return join(normalized, 'antigravity-cli');
}

function getLastConversationsPath(geminiDir: string): string {
  return join(getAntigravityDataDir(geminiDir), 'cache', 'last_conversations.json');
}

function hasAntigravityKeyringState(geminiDir: string): boolean {
  const keyringDir = join(geminiDir, '.local', 'share', 'keyrings');
  if (!existsSync(keyringDir)) return false;

  try {
    return readdirSync(keyringDir).some((name) => statSync(join(keyringDir, name)).size > 0);
  } catch {
    return false;
  }
}

function stripKnownPrefix(output: string, prefix: string | null | undefined): string | null {
  const normalizedPrefix = prefix?.trimEnd();
  if (!normalizedPrefix || !output.startsWith(normalizedPrefix)) return null;
  const suffix = output.slice(normalizedPrefix.length);
  if (suffix && !/^\s/.test(suffix)) return null;
  return suffix.replace(/^\s+/, '').trimEnd();
}

function stripInternalPromptBlocks(output: string): string {
  return output
    .replace(/\[MODE\][\s\S]*?\[\/MODE\]\s*/g, '')
    .trimEnd();
}

export function extractAntigravityLatestOutput(
  output: string,
  previousStdout: string | null | undefined,
  previousAssistantMessages: string[] = []
): string {
  const cleaned = output.trimEnd();
  const cursorStripped = stripKnownPrefix(cleaned, previousStdout);
  if (cursorStripped !== null) return stripInternalPromptBlocks(cursorStripped);

  const singleMessageStripped = [...previousAssistantMessages]
    .sort((a, b) => b.length - a.length)
    .map((message) => stripKnownPrefix(cleaned, message))
    .find((stripped): stripped is string => stripped !== null);
  if (singleMessageStripped !== undefined) return stripInternalPromptBlocks(singleMessageStripped);

  let sequential = cleaned;
  let strippedAny = false;
  for (const message of previousAssistantMessages) {
    const stripped = stripKnownPrefix(sequential, message);
    if (stripped === null) continue;
    sequential = stripped;
    strippedAny = true;
  }
  if (strippedAny) return stripInternalPromptBlocks(sequential);

  const visibleCleaned = stripInternalPromptBlocks(cleaned);
  const previousVisibleMessages = previousAssistantMessages.map(stripInternalPromptBlocks);
  const visibleMessageStripped = [...previousVisibleMessages]
    .sort((a, b) => b.length - a.length)
    .map((message) => stripKnownPrefix(visibleCleaned, message))
    .find((stripped): stripped is string => stripped !== null);
  if (visibleMessageStripped !== undefined) return visibleMessageStripped;

  let visibleSequential = visibleCleaned;
  let strippedVisibleAny = false;
  for (const message of previousVisibleMessages) {
    const stripped = stripKnownPrefix(visibleSequential, message);
    if (stripped === null) continue;
    visibleSequential = stripped;
    strippedVisibleAny = true;
  }
  return strippedVisibleAny ? visibleSequential : visibleCleaned;
}

function normalizeWorkspaceKeys(workspaceDir: string): string[] {
  const keys = new Set<string>([workspaceDir, resolve(workspaceDir)]);
  try {
    keys.add(realpathSync.native(workspaceDir));
  } catch {
    /* workspace may not exist yet */
  }
  return [...keys];
}

export function buildAntigravityArgs(prompt: string, sessionId: string | null): string[] {
  const providerTokens = buildProviderArgs(ANTIGRAVITY_PROVIDER_ARGS_CONFIG);
  const args = [...providerTokens];
  if (sessionId) args.push('--conversation', sessionId);
  args.push(`--prompt=${prompt}`);
  return args;
}

export function readAntigravityLastConversation(
  geminiDir: string,
  workspaceDir: string
): string | null {
  try {
    const path = getLastConversationsPath(geminiDir);
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    for (const key of normalizeWorkspaceKeys(workspaceDir)) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  } catch {
    return null;
  }
  return null;
}

export class AntigravityStrategy extends AbstractCLIStrategy {
  private readonly paths: ProviderConversationPaths;

  constructor(useApiTokenMode = false, conversationDataDir?: ConversationDataDirProvider) {
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

  ensureSettings(): void {
    const dataDir = getAntigravityDataDir(this.getGeminiDirForSession());
    mkdirSync(join(dataDir, 'cache'), { recursive: true });
  }

  getModelArgs(_model: string): string[] {
    return [];
  }

  hasNativeSessionSupport(): boolean {
    return this.readSessionId() !== null;
  }

  executeAuth(connection: AuthConnection): void {
    this.currentConnection = connection;
    if (this.hasAntigravityConversationState()) {
      connection.sendAuthSuccess();
      this.currentConnection = null;
      return;
    }

    this.ensureSettings();
    this.prepareWorkingDir();
    let output = '';
    let authUrlExtracted = false;
    const proc = spawn(getAntigravityCommand(), [`--prompt=${AUTH_PROMPT}`, '--print-timeout', AUTH_TIMEOUT], {
      env: this.getAntigravityProcessEnv(),
      cwd: this.getWorkingDir(),
      shell: false,
    });

    const handleData = (data: Buffer | string) => {
      const text = data.toString();
      output += text;
      const match = output.match(GOOGLE_OAUTH_URL_REGEX);
      if (match && !authUrlExtracted) {
        authUrlExtracted = true;
        this.currentConnection?.sendAuthUrlGenerated(match[0]);
      }
    };

    proc.stdout?.on('data', handleData);
    proc.stderr?.on('data', handleData);

    proc.on('close', (code) => {
      if (this.currentConnection) {
        const failed = code !== 0 || AUTH_FAILURE_REGEX.test(output);
        if (failed) {
          this.currentConnection.sendAuthStatus('unauthenticated');
        } else {
          this.captureSessionAfterRun();
          this.currentConnection.sendAuthSuccess();
        }
      }
      this.activeAuthProcess = null;
      this.authCancel = null;
      this.currentConnection = null;
    });

    proc.on('error', (err) => {
      if (this.currentConnection) {
        const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
        this.currentConnection.sendError(
          isNotFound
            ? 'Antigravity CLI not found. Install it with: curl -fsSL https://antigravity.google/cli/install.sh | bash'
            : err.message
        );
        this.currentConnection.sendAuthStatus('unauthenticated');
      }
      this.activeAuthProcess = null;
      this.authCancel = null;
      this.currentConnection = null;
    });

    this.activeAuthProcess = proc;
    this.authCancel = () => proc.kill();
  }

  submitAuthCode(code: string): void {
    const trimmed = (code ?? '').trim();
    if (!trimmed) {
      this.currentConnection?.sendAuthStatus('unauthenticated');
      return;
    }
    this.activeAuthProcess?.stdin?.write(`${trimmed}\n`);
  }

  clearCredentials(): void {
    rmSync(getAntigravityDataDir(this.getGeminiDirForSession()), { recursive: true, force: true });
    rmSync(join(this.getGeminiDirForSession(), '.local', 'share', 'keyrings'), { recursive: true, force: true });
    this.clearCredentialMarker();
    this.paths.clearSessionMarker();
    this.clearStdoutCursor();
  }

  executeLogout(connection: LogoutConnection): void {
    this.clearCredentials();
    connection.sendLogoutSuccess();
  }

  checkAuthStatus(): Promise<boolean> {
    return Promise.resolve(this.hasAntigravityConversationState());
  }

  executePromptStreaming(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    systemPrompt?: string,
    runtimeOptions?: AgentRuntimeOptions
  ): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      this.streamInterrupted = false;
      this.ensureSettings();
      this.prepareWorkingDir();

      const workspaceDir = this.getWorkingDir();
      const effectivePrompt = this.buildPromptWithPending(prompt, systemPrompt);
      const sessionId = this.readSessionId();
      const args = [
        ...this.getModelArgs(model),
        ...buildAntigravityArgs(effectivePrompt, sessionId),
      ];
      const previousStdout = this.readStdoutCursor();

      const antigravityProcess = spawn(getAntigravityCommand(), args, {
        env: this.getAntigravityProcessEnv(),
        cwd: workspaceDir,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.currentStreamProcess = antigravityProcess;

      let stdout = '';
      let stderr = '';
      let authUrlEmitted = false;
      let stderrReasoningStarted = false;

      callbacks?.onStep?.({
        id: 'antigravity-cli',
        title: 'Antigravity CLI',
        status: 'processing',
        details: sessionId ? 'Resuming provider conversation.' : 'Starting provider conversation.',
        timestamp: new Date(),
      });

      const detectAndEmitAuthUrl = (output: string) => {
        if (authUrlEmitted) return;
        const match = output.match(GOOGLE_OAUTH_URL_REGEX);
        if (!match) return;
        authUrlEmitted = true;
        callbacks?.onAuthRequired?.(match[0]);
      };

      antigravityProcess.stdout?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        stdout += text;
        detectAndEmitAuthUrl(stdout);
      });

      antigravityProcess.stderr?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        stderr += text;
        detectAndEmitAuthUrl(stderr);
        const cleanText = this.stripAnsi(text);
        if (cleanText.trim() && callbacks?.onReasoningChunk) {
          if (!stderrReasoningStarted) {
            stderrReasoningStarted = true;
            callbacks.onReasoningStart?.();
          }
          callbacks.onReasoningChunk(cleanText);
        }
      });

      antigravityProcess.on('error', (err) => {
        this.currentStreamProcess = null;
        if (stderrReasoningStarted) callbacks?.onReasoningEnd?.();
        reject(err);
      });

      antigravityProcess.on('close', (code) => {
        this.currentStreamProcess = null;
        if (stderrReasoningStarted) callbacks?.onReasoningEnd?.();

        if (this.streamInterrupted) {
          reject(new Error(INTERRUPTED_MESSAGE));
          return;
        }

        const fullCleanedStdout = this.cleanProviderOutput(stdout);
        const cleanedStdout = extractAntigravityLatestOutput(
          fullCleanedStdout,
          previousStdout,
          runtimeOptions?.previousAssistantMessages,
        );
        const combinedOutput = [stdout, stderr].filter((text) => text.trim()).join('\n');

        const authError = detectProviderAuthFailure('Antigravity', combinedOutput);
        if (authError) {
          this.clearAuthStatusMarkers();
          reject(authError);
          return;
        }

        if (AUTH_FAILURE_REGEX.test(combinedOutput)) {
          this.clearAuthStatusMarkers();
          reject(new Error('Authentication required. Please sign in with Google Antigravity.'));
          return;
        }

        const missingConversation = combinedOutput.match(MISSING_CONVERSATION_REGEX);
        if (missingConversation) {
          this.paths.clearSessionMarker();
          this.clearStdoutCursor();
          reject(new Error(`Stored Antigravity conversation was not found: ${missingConversation[1]}. Retry to start a fresh provider conversation.`));
          return;
        }

        if (code !== 0 && code !== null) {
          reject(new Error(stderr.trim() || stdout.trim() || `Antigravity exited with code ${code}`));
          return;
        }

        if (!cleanedStdout.trim()) {
          this.paths.clearSessionMarker();
          this.clearStdoutCursor();
          reject(new Error('Agent process completed successfully but returned no output. Session not saved to prevent corruption.'));
          return;
        }

        this.captureSessionAfterRun();
        this.writeStdoutCursor(fullCleanedStdout);
        callbacks?.onStep?.({
          id: 'antigravity-cli',
          title: 'Antigravity CLI',
          status: 'complete',
          details: 'Provider response received.',
          timestamp: new Date(),
        });
        onChunk(cleanedStdout);
        resolvePromise();
      });
    });
  }

  private getGeminiDirForSession(): string {
    return getAntigravityGeminiDir();
  }

  private getAntigravityProcessEnv(extraEnv: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const geminiDir = this.getGeminiDirForSession();
    return {
      ...process.env,
      ...this.getProxyEnv(),
      ...extraEnv,
      HOME: getHomeRootForGeminiDir(geminiDir),
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME?.trim() || join(geminiDir, '.config'),
      XDG_DATA_HOME: process.env.XDG_DATA_HOME?.trim() || join(geminiDir, '.local', 'share'),
      XDG_STATE_HOME: process.env.XDG_STATE_HOME?.trim() || join(geminiDir, '.local', 'state'),
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME?.trim() || join(geminiDir, '.cache'),
      BROWSER: '/bin/true',
      DISPLAY: '',
      NO_BROWSER: 'true',
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

  private captureSessionAfterRun(): void {
    const sessionId = readAntigravityLastConversation(this.getGeminiDirForSession(), this.getWorkingDir());
    if (sessionId) {
      this.paths.writeSessionMarker(sessionId);
    }
  }

  private hasAntigravityConversationState(): boolean {
    const lastConversations = getLastConversationsPath(this.getGeminiDirForSession());
    if (existsSync(lastConversations)) return true;
    if (existsSync(join(this.getGeminiDirForSession(), 'auth.json'))) return true;
    if (hasAntigravityKeyringState(this.getGeminiDirForSession())) return true;
    return false;
  }

  private clearCredentialMarker(): void {
    rmSync(join(this.getGeminiDirForSession(), 'auth.json'), { force: true });
  }

  private clearAuthStatusMarkers(): void {
    this.clearCredentialMarker();
    rmSync(getLastConversationsPath(this.getGeminiDirForSession()), { force: true });
    rmSync(join(this.getGeminiDirForSession(), '.local', 'share', 'keyrings'), { recursive: true, force: true });
    this.paths.clearSessionMarker();
    this.clearStdoutCursor();
  }

  private getStdoutCursorPath(): string | null {
    const stateDir = this.paths.getConversationStateDir();
    return stateDir ? join(stateDir, STDOUT_CURSOR_FILE) : null;
  }

  private readStdoutCursor(): string | null {
    try {
      const path = this.getStdoutCursorPath();
      if (!path || !existsSync(path)) return null;
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  }

  private writeStdoutCursor(output: string): void {
    const path = this.getStdoutCursorPath();
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, output, { mode: 0o600 });
  }

  private clearStdoutCursor(): void {
    const path = this.getStdoutCursorPath();
    if (path) rmSync(path, { force: true });
  }

  private cleanProviderOutput(output: string): string {
    return this.stripAnsi(output)
      .split(/\r?\n/)
      .filter((line) => !MISSING_CONVERSATION_REGEX.test(line))
      .join('\n')
      .trimEnd();
  }
}
