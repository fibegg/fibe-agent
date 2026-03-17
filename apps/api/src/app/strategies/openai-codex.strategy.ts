import { Logger } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthConnection, LogoutConnection } from './strategy.types';
import { INTERRUPTED_MESSAGE, type AgentStrategy } from './strategy.types';
import { runAuthProcess } from './auth-process-helper';

const CODEX_CONFIG_DIR = join(process.env.HOME ?? '/home/node', '.codex');
const CODEX_AUTH_FILE = join(CODEX_CONFIG_DIR, 'auth.json');

export class OpenaiCodexStrategy implements AgentStrategy {
  private readonly logger = new Logger(OpenaiCodexStrategy.name);
  private activeAuthProcess: ReturnType<typeof spawn> | null = null;
  private currentConnection: AuthConnection | null = null;
  private authCancel: (() => void) | null = null;
  private currentStreamProcess: ChildProcess | null = null;
  private streamInterrupted = false;

  executeAuth(connection: AuthConnection): void {
    this.currentConnection = connection;
    let authUrlExtracted = false;
    let deviceCodeExtracted = false;

    const { process: proc, cancel } = runAuthProcess('codex', ['login', '--device-auth'], {
      env: process.env,
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
        this.logger.error('Codex Auth Process error', err);
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
    if (this.activeAuthProcess?.stdin) {
      this.activeAuthProcess.stdin.write((code ?? '').trim() + '\n');
    }
  }

  clearCredentials(): void {
    if (existsSync(CODEX_AUTH_FILE)) {
      unlinkSync(CODEX_AUTH_FILE);
    }
  }

  executeLogout(connection: LogoutConnection): void {
    const logoutProcess = spawn('codex', ['logout'], {
      env: { ...process.env },
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
    return new Promise((resolve) => {
      if (!existsSync(CODEX_AUTH_FILE)) {
        resolve(false);
        return;
      }
      try {
        const content = readFileSync(CODEX_AUTH_FILE, 'utf8');
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
      const playgroundDir = join(process.cwd(), 'playground');
      if (!existsSync(playgroundDir)) {
        mkdirSync(playgroundDir, { recursive: true });
      }

      const effectivePrompt = systemPrompt ? `${systemPrompt}\n${prompt}` : prompt;
      const codexArgs = ['exec', '--yolo', effectivePrompt];

      const codexProcess = spawn('codex', codexArgs, {
        env: { ...process.env },
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
