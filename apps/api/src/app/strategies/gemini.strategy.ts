import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthConnection, ConversationDataDirProvider, LogoutConnection } from './strategy.types';
import { INTERRUPTED_MESSAGE } from './strategy.types';
import { AbstractCLIStrategy } from './abstract-cli.strategy';
import { runAuthProcess } from './auth-process-helper';

const GEMINI_CONFIG_DIR = process.env.SESSION_DIR || join(process.env.HOME ?? '/home/node', '.gemini');
const GEMINI_API_KEY_ENV = 'GEMINI_API_KEY';
const AUTH_REQUIRED_MESSAGE = 'Authentication required. Please sign in with Google.';
const GEMINI_WORKSPACE_SUBDIR = 'gemini_workspace';
const SESSION_MARKER_FILE = '.gemini_session';

export class GeminiStrategy extends AbstractCLIStrategy {
  private _hasSession = false;
  private _apiToken: string | null = null;

  constructor(useApiTokenMode = false, conversationDataDir?: ConversationDataDirProvider) {
    super(GeminiStrategy.name, useApiTokenMode, conversationDataDir);
  }

  private getGeminiWorkspaceDir(): string {
    if (this.conversationDataDir) {
      return join(this.conversationDataDir.getConversationDataDir(), GEMINI_WORKSPACE_SUBDIR);
    }
    return join(process.cwd(), 'playground');
  }

  getWorkingDir(): string {
    return this.getGeminiWorkspaceDir();
  }

  ensureSettings(): void {
    if (!existsSync(GEMINI_CONFIG_DIR)) {
      mkdirSync(GEMINI_CONFIG_DIR, { recursive: true });
    }
    const settingsPath = join(GEMINI_CONFIG_DIR, 'settings.json');
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
        this._hasSession = true;
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
      env: { ...process.env, NO_BROWSER: 'true' },
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
        this._hasSession = true;
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
    this._hasSession = false;
    const credentialFiles = ['oauth_creds.json', 'credentials.json', '.credentials.json'];
    for (const file of credentialFiles) {
      const filePath = join(GEMINI_CONFIG_DIR, file);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
    const configSubDirs = ['Configure', 'auth'];
    for (const dir of configSubDirs) {
      const dirPath = join(GEMINI_CONFIG_DIR, dir);
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
      env: { ...process.env },
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
      this._hasSession = false;
      connection.sendLogoutSuccess();
    });

    logoutProcess.on('error', () => {
      this.clearCredentials();
      this._hasSession = false;
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
        env: { ...process.env, NO_BROWSER: 'true' },
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
      if (!existsSync(workspaceDir)) {
        mkdirSync(workspaceDir, { recursive: true });
      }
      if (this.conversationDataDir) {
        this._hasSession = existsSync(join(workspaceDir, SESSION_MARKER_FILE));
      }

      const effectivePrompt = systemPrompt ? `${systemPrompt}\n${prompt}` : prompt;
      const geminiArgs = [
        ...this.getModelArgs(model),
        ...(this._hasSession ? ['--resume'] : []),
        '--yolo',
        '-p',
        effectivePrompt,
      ];

      const env: NodeJS.ProcessEnv = { ...process.env, ...this.getProxyEnv(), NO_BROWSER: 'true' };
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
        if ((code === 0 || code === null) && !hasEmittedOutput) {
          if (this.conversationDataDir) {
            try { rmSync(join(workspaceDir, SESSION_MARKER_FILE), { force: true }); } catch { /* ignore cleanup errors */ }
          }
          reject(new Error('Agent process completed successfully but returned no output. Session not saved to prevent corruption.'));
          return;
        }
        if (code === 0 || code === null) {
          this._hasSession = true;
          if (this.conversationDataDir) {
            try {
              writeFileSync(join(workspaceDir, SESSION_MARKER_FILE), '');
            } catch {
              /* ignore */
            }
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
    return true;
  }
}
