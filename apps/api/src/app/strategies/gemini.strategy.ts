import { Logger } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthConnection, LogoutConnection } from './strategy.types';
import { INTERRUPTED_MESSAGE, type AgentStrategy } from './strategy.types';
import { runAuthProcess } from './auth-process-helper';

const GEMINI_CONFIG_DIR = join(process.env.HOME ?? '/home/node', '.gemini');

export class GeminiStrategy implements AgentStrategy {
  private readonly logger = new Logger(GeminiStrategy.name);
  private activeAuthProcess: ReturnType<typeof spawn> | null = null;
  private currentConnection: AuthConnection | null = null;
  private authCancel: (() => void) | null = null;
  private _hasSession = false;
  private currentStreamProcess: ChildProcess | null = null;
  private streamInterrupted = false;

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

  checkAuthStatus(): Promise<boolean> {
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

  interruptAgent(): void {
    this.streamInterrupted = true;
    this.currentStreamProcess?.kill();
  }

  executePromptStreaming(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    _callbacks?: import('./strategy.types').StreamingCallbacks,
    systemPrompt?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.streamInterrupted = false;
      this.ensureSettings();
      const playgroundDir = join(process.cwd(), 'playground');
      if (!existsSync(playgroundDir)) {
        mkdirSync(playgroundDir, { recursive: true });
      }

      const effectivePrompt = systemPrompt ? `${systemPrompt}\n${prompt}` : prompt;
      const geminiArgs = [
        ...this.getModelArgs(model),
        ...(this._hasSession ? ['--resume'] : []),
        '--yolo',
        '-p',
        effectivePrompt,
      ];

      const geminiProcess = spawn('gemini', geminiArgs, {
        env: { ...process.env, NO_BROWSER: 'true' },
        cwd: playgroundDir,
        shell: false,
      });
      this.currentStreamProcess = geminiProcess;

      let errorResult = '';

      geminiProcess.stdout?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        onChunk(text);
      });

      geminiProcess.stderr?.on('data', (data: Buffer | string) => {
        errorResult += data.toString();
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
        if (code === 0 || code === null) {
          this._hasSession = true;
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
}
