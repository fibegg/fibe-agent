import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { detectProviderAuthFailure } from '@shared/provider-auth-errors';
import type { AuthConnection, ConversationDataDirProvider, LogoutConnection } from './strategy.types';
import { INTERRUPTED_MESSAGE } from './strategy.types';
import { AbstractCLIStrategy } from './abstract-cli.strategy';
import { runAuthProcess } from './auth-process-helper';
import { buildProviderArgs, type ProviderArgsConfig } from './provider-args';
import { ProviderConversationPaths } from './provider-conversation-paths';

const GEMINI_API_KEY_ENV = 'GEMINI_API_KEY';
const AUTH_REQUIRED_MESSAGE = 'Authentication required. Please sign in with Google.';
const GEMINI_WORKSPACE_SUBDIR = 'gemini_workspace';
const SESSION_MARKER_FILE = '.gemini_session';
const GEMINI_RESUME_LATEST = 'latest';
const MISSING_SESSION_ERROR_PATTERNS = [
  /No conversation found with session ID:/i,
  /\b(conversation|session)\b[^\n]*\b(not found|missing)\b/i,
  /\b(failed|unable)\b[^\n]*\b(resume|continue)\b/i,
];

interface GeminiSessionFile {
  sessionId: string;
  filePath: string;
  lastUpdatedMs: number;
  mtimeMs: number;
  content: string;
}

/**
 * Gemini CLI resolves its config dir as `${homedir()}/.gemini`, where
 * `homedir()` prefers the `GEMINI_CLI_HOME` env var over `os.homedir()`.
 * When SESSION_DIR is set (e.g. `/app/data/<id>/.gemini`) we point the CLI at
 * its parent so the CLI's lookup lands on our per-agent SESSION_DIR — which
 * already holds the `settings.json` + `oauth_creds.json` written by the
 * strategy and the credential injector.
 */
function getGeminiHomeEnv(): { GEMINI_CLI_HOME?: string } {
  if (process.env.GEMINI_CLI_HOME?.trim()) return {};

  const sessionDir = process.env.SESSION_DIR;
  if (!sessionDir) return {};
  return { GEMINI_CLI_HOME: dirname(sessionDir) };
}

function getGeminiProcessEnv(extraEnv: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...getGeminiHomeEnv(),
    NO_BROWSER: 'true',
    ...process.env,
    ...extraEnv,
  };
}

function getGeminiConfigDir(): string {
  if (process.env.SESSION_DIR?.trim()) return process.env.SESSION_DIR;
  if (process.env.GEMINI_CLI_HOME?.trim()) return join(process.env.GEMINI_CLI_HOME, '.gemini');
  return join(process.env.HOME ?? '/home/node', '.gemini');
}

function getModelArgsList(model: string): string[] {
  if (!model || model === 'undefined') return [];
  return ['-m', model];
}

const GEMINI_PROVIDER_ARGS_CONFIG: ProviderArgsConfig = {
  defaultArgs: {},
  blockedArgs: {
    '--yolo': true,    // non-interactive mode, always enforced
    '-p': false,       // handled dynamically
  },
};

/**
 * Build Gemini CLI args. The prompt is passed via the `-p=<value>` equals-sign
 * form so yargs binds it to `-p` even when it starts with `-` (e.g. a system
 * prompt that begins with a markdown bullet). Using `-p <value>` as two
 * separate args fails with "Not enough arguments following: p".
 */
export function buildGeminiArgs(
  effectivePrompt: string,
  model: string,
  sessionId: string | null
): string[] {
  return [
    ...getModelArgsList(model),
    ...(sessionId ? ['--resume', sessionId] : []),
    `-p=${effectivePrompt}`,
    ...buildProviderArgs(GEMINI_PROVIDER_ARGS_CONFIG),
  ];
}

function missingSessionError(message: string): boolean {
  return MISSING_SESSION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export class GeminiStrategy extends AbstractCLIStrategy {
  private _apiToken: string | null = null;
  private readonly paths: ProviderConversationPaths;

  constructor(useApiTokenMode = false, conversationDataDir?: ConversationDataDirProvider) {
    super(GeminiStrategy.name, useApiTokenMode, conversationDataDir);
    this.paths = new ProviderConversationPaths({
      conversationDataDir,
      workspaceSubdir: GEMINI_WORKSPACE_SUBDIR,
      fallbackWorkspaceDir: join(process.cwd(), 'playground'),
      sessionMarkerFile: SESSION_MARKER_FILE,
    });
  }

  private getGeminiWorkspaceDir(): string {
    return this.paths.getWorkspaceDir();
  }

  getWorkingDir(): string {
    return this.getGeminiWorkspaceDir();
  }

  prepareWorkingDir(): void {
    this.paths.prepareWorkspace();
  }

  private readStoredSession(): string | null {
    const stored = this.paths.readSessionMarker();
    if (stored) return stored;
    try {
      // Older builds wrote an empty marker in the workspace and resumed the
      // latest Gemini session implicitly. Keep that only for default/legacy
      // compatibility; UUID conversations must have an explicit Gemini UUID.
      if (this.shouldReadLegacyWorkspaceMarker() && existsSync(this.paths.getLegacyWorkspaceMarkerPath())) {
        return GEMINI_RESUME_LATEST;
      }
    } catch {
      /* ignore legacy marker read errors */
    }
    return null;
  }

  private shouldReadLegacyWorkspaceMarker(): boolean {
    const provider = this.conversationDataDir;
    if (!provider) return true;
    if (provider.getConversationId?.() === 'default') return true;
    const defaultDir = provider.getDefaultConversationDataDir?.();
    return Boolean(defaultDir && defaultDir === provider.getConversationDataDir());
  }

  private writeStoredSession(sessionId: string): void {
    this.paths.writeSessionMarker(sessionId);
  }

  private clearStoredSession(): void {
    this.paths.clearSessionMarker();
  }

  private getGeminiTmpDir(): string {
    return join(getGeminiConfigDir(), 'tmp');
  }

  private normalizeProjectPath(path: string): string {
    let normalized = resolve(path);
    try {
      normalized = realpathSync.native(normalized);
    } catch {
      /* path may not exist yet; keep resolved form */
    }
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }

  private readProjectSessions(workspaceDir: string): GeminiSessionFile[] {
    const tmpDir = this.getGeminiTmpDir();
    if (!existsSync(tmpDir)) return [];
    const expectedRoot = this.normalizeProjectPath(workspaceDir);
    const sessions: GeminiSessionFile[] = [];
    let projectEntries: import('node:fs').Dirent[];
    try {
      projectEntries = readdirSync(tmpDir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const entry of projectEntries) {
      if (!entry.isDirectory()) continue;
      const projectDir = join(tmpDir, entry.name);
      const projectRootPath = join(projectDir, '.project_root');
      let owner = '';
      try {
        if (!existsSync(projectRootPath)) continue;
        owner = readFileSync(projectRootPath, 'utf8').trim();
      } catch {
        continue;
      }
      if (this.normalizeProjectPath(owner) !== expectedRoot) continue;

      const chatsDir = join(projectDir, 'chats');
      let chatFiles: import('node:fs').Dirent[];
      try {
        chatFiles = readdirSync(chatsDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const file of chatFiles) {
        if (!file.isFile() || !file.name.startsWith('session-') || !file.name.endsWith('.json')) continue;
        const filePath = join(chatsDir, file.name);
        const parsed = this.readGeminiSessionFile(filePath);
        if (parsed) sessions.push(parsed);
      }
    }
    return sessions;
  }

  private readGeminiSessionFile(filePath: string): GeminiSessionFile | null {
    try {
      const content = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId.trim() : '';
      if (!sessionId) return null;
      const lastUpdated = typeof parsed.lastUpdated === 'string' ? Date.parse(parsed.lastUpdated) : Number.NaN;
      const mtimeMs = statSync(filePath).mtimeMs;
      return {
        sessionId,
        filePath,
        lastUpdatedMs: Number.isFinite(lastUpdated) ? lastUpdated : mtimeMs,
        mtimeMs,
        content,
      };
    } catch {
      return null;
    }
  }

  private captureSessionIdAfterRun(
    workspaceDir: string,
    knownSessionIds: Set<string>,
    startedAtMs: number,
    promptNeedle: string
  ): string | null {
    const cutoffMs = startedAtMs - 5_000;
    const sessions = this.readProjectSessions(workspaceDir)
      .filter((session) =>
        !knownSessionIds.has(session.sessionId)
        || session.lastUpdatedMs >= cutoffMs
        || session.mtimeMs >= cutoffMs
      )
      .sort((a, b) => Math.max(b.lastUpdatedMs, b.mtimeMs) - Math.max(a.lastUpdatedMs, a.mtimeMs));
    if (sessions.length === 0) return null;

    const trimmedNeedle = promptNeedle.trim().slice(0, 512);
    if (trimmedNeedle) {
      const matching = sessions.find((session) => session.content.includes(trimmedNeedle));
      if (matching) return matching.sessionId;
    }
    return sessions[0].sessionId;
  }

  ensureSettings(): void {
    const geminiConfigDir = getGeminiConfigDir();
    if (!existsSync(geminiConfigDir)) {
      mkdirSync(geminiConfigDir, { recursive: true });
    }
    const settingsPath = join(geminiConfigDir, 'settings.json');
    let existing: Record<string, unknown> = {};
    try {
      if (existsSync(settingsPath)) {
        existing = JSON.parse(readFileSync(settingsPath, 'utf8'));
      }
    } catch { /* start fresh */ }

    const config = {
      ...existing,
      security: { auth: { selectedType: "oauth-personal" } },
    };
    writeFileSync(settingsPath, JSON.stringify(config, null, 2));
  }

  executeAuth(connection: AuthConnection): void {
    this.currentConnection = connection;

    if (this.useApiTokenMode) {
      const token = this.getApiToken();
      if (token && token.trim()) {
        this.currentConnection.sendAuthSuccess();
      } else {
        this.currentConnection.sendAuthManualToken();
      }
      return;
    }

    this.ensureSettings();
    let authUrlExtracted = false;
    let isCode42Expected = false;

    const { process: proc, cancel } = runAuthProcess('gemini', ['-p', ''], {
      env: getGeminiProcessEnv(),
      onData: (output) => {
        if (
          output.includes('No input provided via stdin') ||
          output.includes('Loaded cached credentials')
        ) {
          isCode42Expected = true;
        }
        if (!output.includes('Waiting for authentication')) {
          this.logger.log(`RAW OUTPUT: ${output.trim()}`);
        }
        const urlMatch = output.match(/https:\/\/accounts\.google\.com[^\s"'>]+/);
        if (urlMatch && !authUrlExtracted) {
          authUrlExtracted = true;
          this.currentConnection?.sendAuthUrlGenerated(urlMatch[0]);
        }
      },
      onClose: (code) => {
        this.logger.log(`Gemini Auth Process exited with code ${code}`);
        if (this.currentConnection) {
          if (code === 0 || (code === 42 && isCode42Expected)) {
            this.currentConnection.sendAuthSuccess();
          } else {
            this.currentConnection.sendAuthStatus('unauthenticated');
          }
        }
        this.activeAuthProcess = null;
        this.authCancel = null;
        this.currentConnection = null;
      },
      onError: (err) => {
        this.logger.error('Gemini Auth Process error', err);
      },
    });

    this.activeAuthProcess = proc;
    this.authCancel = cancel;
  }



  submitAuthCode(code: string): void {
    const trimmed = (code ?? '').trim();
    if (this.useApiTokenMode) {
      if (trimmed) {
        this._apiToken = trimmed;
        this.currentConnection?.sendAuthSuccess();
      } else {
        this.currentConnection?.sendAuthStatus('unauthenticated');
      }
      return;
    }
    if (this.activeAuthProcess?.stdin) {
      this.activeAuthProcess.stdin.write(trimmed + '\n');
    }
  }

  clearCredentials(): void {
    this._apiToken = null;
    const credentialFiles = ['oauth_creds.json', 'credentials.json', '.credentials.json'];
    const geminiConfigDir = getGeminiConfigDir();
    for (const file of credentialFiles) {
      const filePath = join(geminiConfigDir, file);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
    const configSubDirs = ['Configure', 'auth'];
    for (const dir of configSubDirs) {
      const dirPath = join(geminiConfigDir, dir);
      if (existsSync(dirPath)) {
        rmSync(dirPath, { recursive: true, force: true });
      }
    }
  }

  executeLogout(connection: LogoutConnection): void {
    if (this.useApiTokenMode) {
      this.clearCredentials();
      connection.sendLogoutSuccess();
      return;
    }
    const logoutProcess = spawn('gemini', ['auth', 'logout'], {
      env: getGeminiProcessEnv(),
      shell: false,
    });

    const handleOutput = (data: Buffer | string) => {
      const text = data.toString();
      connection.sendLogoutOutput(text);
    };

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

  private getApiToken(): string | null {
    const envToken = process.env[GEMINI_API_KEY_ENV]?.trim();
    if (envToken) return envToken;
    return this._apiToken;
  }

  checkAuthStatus(): Promise<boolean> {
    if (this.useApiTokenMode) {
      const token = this.getApiToken();
      return Promise.resolve(Boolean(token));
    }

    return new Promise((resolve) => {
      this.ensureSettings();
      const geminiProcess = spawn('gemini', ['-p', ''], {
        env: getGeminiProcessEnv(),
        shell: false,
      });

      let outputStr = '';
      let resolved = false;
      let isCode42Expected = false;

      const handleData = (data: Buffer | string) => {
        if (resolved) return;
        const text = data.toString();
        outputStr += text;
        if (
          text.includes('No input provided via stdin') ||
          text.includes('Loaded cached credentials')
        ) {
          isCode42Expected = true;
        }
        if (
          /https:\/\/accounts\.google\.com[^\s"'>]+/.test(outputStr) ||
          text.includes('Waiting for authentication')
        ) {
          resolved = true;
          geminiProcess.kill();
          resolve(false);
        }
      };

      geminiProcess.stdout?.on('data', handleData);
      geminiProcess.stderr?.on('data', handleData);

      geminiProcess.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          resolve(code === 0 || (code === 42 && isCode42Expected));
        }
      });

      geminiProcess.on('error', () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });
    });
  }

  getModelArgs(model: string): string[] {
    if (!model || model === 'undefined') return [];
    return ['-m', model];
  }



  private static readonly GOOGLE_OAUTH_URL_REGEX =
    /https:\/\/accounts\.google\.com\/o\/oauth2\/[^\s"'<>]+/;

  executePromptStreaming(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: import('./strategy.types').StreamingCallbacks,
    systemPrompt?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.streamInterrupted = false;
      if (!this.useApiTokenMode) {
        this.ensureSettings();
      }
      const workspaceDir = this.getGeminiWorkspaceDir();
      this.prepareWorkingDir();
      const storedSessionId = this.readStoredSession();

      const pendingMessages = this.consumePendingMessages();
      let finalPrompt = prompt;
      if (pendingMessages) {
        finalPrompt = `[Operator Interruption]\n${pendingMessages}\n\n${prompt}`;
      }
      const effectivePrompt = systemPrompt ? `${systemPrompt}\n${finalPrompt}` : finalPrompt;
      const knownSessionIds = new Set(this.readProjectSessions(workspaceDir).map((session) => session.sessionId));
      const startedAtMs = Date.now();
      const geminiArgs = buildGeminiArgs(effectivePrompt, model, storedSessionId);

      const env: NodeJS.ProcessEnv = getGeminiProcessEnv(this.getProxyEnv());
      if (this.useApiTokenMode) {
        const token = this.getApiToken();
        if (token) {
          env[GEMINI_API_KEY_ENV] = token;
        }
      }

      const geminiProcess = spawn('gemini', geminiArgs, {
        env,
        cwd: workspaceDir,
        shell: false,
      });
      this.currentStreamProcess = geminiProcess;

      let errorResult = '';
      let stdoutBuffer = '';
      let authUrlEmitted = false;
      let hasEmittedOutput = false;

      const detectAndEmitAuthUrl = (output: string): boolean => {
        if (authUrlEmitted) return true;
        const match = output.match(GeminiStrategy.GOOGLE_OAUTH_URL_REGEX);
        if (match) {
          authUrlEmitted = true;
          callbacks?.onAuthRequired?.(match[0]);
          return true;
        }
        return false;
      };

      geminiProcess.stdout?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        stdoutBuffer += text;
        if (detectAndEmitAuthUrl(stdoutBuffer)) {
          geminiProcess.kill();
          reject(new Error(AUTH_REQUIRED_MESSAGE));
          return;
        }
        if (text.trim()) hasEmittedOutput = true;
        onChunk(text);
      });

      geminiProcess.stderr?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        errorResult += text;
        if (detectAndEmitAuthUrl(errorResult)) {
          geminiProcess.kill();
          reject(new Error(AUTH_REQUIRED_MESSAGE));
        }
      });

      geminiProcess.on('close', (code) => {
        this.currentStreamProcess = null;
        if (this.streamInterrupted) {
          reject(new Error(INTERRUPTED_MESSAGE));
          return;
        }
        const shouldInspectFailure = (code !== 0 && code !== null) || !hasEmittedOutput || Boolean(errorResult.trim());
        if (shouldInspectFailure) {
          const authError = detectProviderAuthFailure('Gemini', [errorResult, stdoutBuffer].filter((s) => s.trim()).join('\n'));
          if (authError) {
            reject(authError);
            return;
          }
        }
        const modelNotFound =
          errorResult.includes('ModelNotFoundError') ||
          errorResult.includes('Requested entity was not found');
        if (modelNotFound) {
          reject(new Error('Invalid model specified. Please check the model name and try again.'));
          return;
        }
        const rateLimited =
          errorResult.includes('RESOURCE_EXHAUSTED') ||
          errorResult.includes('MODEL_CAPACITY_EXHAUSTED') ||
          errorResult.includes('status 429');
        if (rateLimited) {
          reject(
            new Error(
              'Model is currently overloaded (rate limited). Please try again in a few minutes or switch to a different model.'
            )
          );
          return;
        }
        if (code !== 0 && missingSessionError(errorResult)) {
          this.clearStoredSession();
        }
        if ((code === 0 || code === null) && !hasEmittedOutput) {
          this.clearStoredSession();
          reject(new Error('Agent process completed successfully but returned no output. Session not saved to prevent corruption.'));
          return;
        }
        if (code === 0 || code === null) {
          const capturedSessionId = storedSessionId && storedSessionId !== GEMINI_RESUME_LATEST
            ? storedSessionId
            : this.captureSessionIdAfterRun(workspaceDir, knownSessionIds, startedAtMs, finalPrompt);
          if (capturedSessionId) {
            this.writeStoredSession(capturedSessionId);
          } else {
            this.logger.warn('Gemini completed but no session UUID was found; next turn will use Fibe history injection.');
          }
          resolve();
        } else {
          reject(
            new Error(
              [errorResult.trim() ? `STDERR: ${errorResult.trim()}` : '', `Process exited with code ${code}`]
                .filter(Boolean)
                .join('\n\n')
            )
          );
        }
      });

      geminiProcess.on('error', (err) => {
        this.currentStreamProcess = null;
        reject(err);
      });
    });
  }

  hasNativeSessionSupport(): boolean {
    return this.readStoredSession() !== null;
  }

  override steerAgent(message: string): void {
    const trimmed = message.trim();
    if (!trimmed) return;
    // Gemini CLI headless mode has no supported in-flight steering boundary.
    // Preserve the operator message and let the orchestrator's queued empty turn
    // deliver it as the next prompt instead of interrupting the current run.
    this.pendingSteerMessages.push(trimmed);
  }
}
