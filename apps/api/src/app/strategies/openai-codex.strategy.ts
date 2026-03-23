import { Logger } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthConnection, ConversationDataDirProvider, LogoutConnection } from './strategy.types';
import { INTERRUPTED_MESSAGE, type AgentStrategy } from './strategy.types';
import { runAuthProcess } from './auth-process-helper';

const DEFAULT_CODEX_HOME = join(process.env.HOME ?? '/home/node', '.codex');
const CODEX_HOME_SUBDIR = 'codex';
const CODEX_WORKSPACE_SUBDIR = 'codex_workspace';
const CODEX_BIN_NAME = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';

function getCodexHome(): string {
  return process.env.SESSION_DIR ?? DEFAULT_CODEX_HOME;
}

function getCodexCommand(): string {
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

export class OpenaiCodexStrategy implements AgentStrategy {
  private readonly logger = new Logger(OpenaiCodexStrategy.name);
  private activeAuthProcess: ReturnType<typeof spawn> | null = null;
  private currentConnection: AuthConnection | null = null;
  private authCancel: (() => void) | null = null;
  private currentStreamProcess: ChildProcess | null = null;
  private streamInterrupted = false;
  private readonly useApiTokenMode: boolean;
  private readonly conversationDataDir: ConversationDataDirProvider | undefined;

  constructor(useApiTokenMode = false, conversationDataDir?: ConversationDataDirProvider) {
    this.useApiTokenMode = useApiTokenMode;
    this.conversationDataDir = conversationDataDir;
  }

  private getCodexHomeForSession(): string {
    if (this.conversationDataDir) {
      return join(this.conversationDataDir.getConversationDataDir(), CODEX_HOME_SUBDIR);
    }
    return getCodexHome();
  }

  getWorkingDir(): string {
    if (this.conversationDataDir) {
      return join(this.conversationDataDir.getConversationDataDir(), CODEX_WORKSPACE_SUBDIR);
    }
    return join(process.cwd(), CODEX_WORKSPACE_SUBDIR);
  }

  ensureSettings(): void {
    const codexHome = this.getCodexHomeForSession();
    if (!existsSync(codexHome)) {
      mkdirSync(codexHome, { recursive: true });
    }
    if (this.useApiTokenMode) {
      const key = process.env[OPENAI_API_KEY_ENV]?.trim();
      if (key) {
        const authPath = join(codexHome, 'auth.json');
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
        const urlMatch = clean.match(/https:\/\/[^\s"'>]+/);
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

  cancelAuth(): void {
    this.authCancel?.();
    this.authCancel = null;
    this.activeAuthProcess = null;
    this.currentConnection = null;
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
    if (existsSync(authFile)) {
      unlinkSync(authFile);
    }
  }

  executeLogout(connection: LogoutConnection): void {
    const env = { ...process.env, CODEX_HOME: this.getCodexHomeForSession() };
    const logoutProcess = spawn(getCodexCommand(), ['logout'], {
      env,
      shell: false,
    });

    const handleOutput = (data: Buffer | string) => {
      connection.sendLogoutOutput(data.toString());
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

  checkAuthStatus(): Promise<boolean> {
    if (this.useApiTokenMode && process.env[OPENAI_API_KEY_ENV]?.trim()) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const authFile = join(this.getCodexHomeForSession(), 'auth.json');
      if (!existsSync(authFile)) {
        resolve(false);
        return;
      }
      try {
        const content = readFileSync(authFile, 'utf8');
        const auth = JSON.parse(content) as { access_token?: string; token?: string; api_key?: string };
        resolve(Boolean(auth?.access_token ?? auth?.token ?? auth?.api_key));
      } catch {
        resolve(false);
      }
    });
  }

  interruptAgent(): void {
    this.streamInterrupted = true;
    this.currentStreamProcess?.kill();
  }

  executePromptStreaming(
    prompt: string,
    _model: string,
    onChunk: (chunk: string) => void,
    callbacks?: import('./strategy.types').StreamingCallbacks,
    systemPrompt?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.streamInterrupted = false;
      if (this.useApiTokenMode) {
        this.ensureSettings();
      }
      const playgroundDir = join(process.cwd(), 'playground');
      if (!existsSync(playgroundDir)) {
        mkdirSync(playgroundDir, { recursive: true });
      }
      const effectivePrompt = systemPrompt ? `${systemPrompt}\n${prompt}` : prompt;
      const codexCmd = getCodexCommand();
      const codexArgs = ['exec', '--yolo', effectivePrompt];
      const env = { ...process.env, CODEX_HOME: this.getCodexHomeForSession() };

      const codexProcess = spawn(codexCmd, codexArgs, {
        env,
        cwd: playgroundDir,
        shell: false,
      });
      this.currentStreamProcess = codexProcess;

      let errorResult = '';

      codexProcess.stdout?.on('data', (data: Buffer | string) => {
        onChunk(data.toString());
      });

      codexProcess.stderr?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        errorResult += text;
        if (callbacks?.onReasoningChunk) {
          callbacks.onReasoningChunk(text);
        } else {
          onChunk(text);
        }
      });

      codexProcess.on('close', (code) => {
        this.currentStreamProcess = null;
        callbacks?.onReasoningEnd?.();
        if (this.streamInterrupted) {
          reject(new Error(INTERRUPTED_MESSAGE));
          return;
        }
        if (code !== 0 && code !== null) {
          reject(new Error(errorResult.trim() || `Process exited with code ${code}`));
        } else {
          resolve();
        }
      });

      codexProcess.on('error', (err) => {
        this.currentStreamProcess = null;
        reject(err);
      });
    });
  }
}
