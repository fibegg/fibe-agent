import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthConnection, LogoutConnection } from './strategy.types';
import type { AgentStrategy } from './strategy.types';

const CLAUDE_CONFIG_DIR = join(process.env.HOME ?? '/home/node', '.claude');
const TOKEN_FILE_PATH = join(CLAUDE_CONFIG_DIR, 'agent_token.txt');
const PLAYGROUND_DIR = join(process.cwd(), 'playground');

export class ClaudeCodeStrategy implements AgentStrategy {
  private currentConnection: AuthConnection | null = null;
  private _hasSession = false;

  private getToken(): string | null {
    if (existsSync(TOKEN_FILE_PATH)) {
      return readFileSync(TOKEN_FILE_PATH, 'utf8').trim();
    }
    return null;
  }

  executeAuth(connection: AuthConnection): void {
    this.currentConnection = connection;
    connection.sendAuthManualToken();
  }

  submitAuthCode(code: string): void {
    const trimmed = (code ?? '').trim();
    if (trimmed) {
      if (!existsSync(CLAUDE_CONFIG_DIR)) {
        mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true });
      }
      writeFileSync(TOKEN_FILE_PATH, trimmed, { mode: 0o600 });
      if (this.currentConnection) {
        this.currentConnection.sendAuthSuccess();
      }
      this._hasSession = true;
    } else {
      this.currentConnection?.sendAuthStatus('unauthenticated');
    }
  }

  cancelAuth(): void {
    this.currentConnection = null;
  }

  clearCredentials(): void {
    if (existsSync(TOKEN_FILE_PATH)) {
      rmSync(TOKEN_FILE_PATH, { force: true });
    }
  }

  executeLogout(connection: LogoutConnection): void {
    const token = this.getToken();
    const logoutProcess = spawn('claude', ['auth', 'logout'], {
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token ?? '' },
      shell: false,
    });
    logoutProcess.stdin?.end();

    const handleOutput = (data: Buffer | string) => {
      connection.sendLogoutOutput(data.toString());
    };

    logoutProcess.stdout?.on('data', handleOutput);
    logoutProcess.stderr?.on('data', handleOutput);

    logoutProcess.on('close', () => {
      this._hasSession = false;
      connection.sendLogoutSuccess();
    });

    logoutProcess.on('error', () => {
      this._hasSession = false;
      connection.sendLogoutSuccess();
    });
  }

  checkAuthStatus(): Promise<boolean> {
    const AUTH_STATUS_TIMEOUT_MS = 10_000;

    return new Promise((resolve) => {
      const token = this.getToken();
      if (!token) {
        resolve(false);
        return;
      }

      const checkProcess = spawn('claude', ['auth', 'status'], {
        env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token },
        shell: false,
      });
      checkProcess.stdin?.end();

      let outputStr = '';
      let resolved = false;

      const finish = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        checkProcess.kill();
        finish(false);
      }, AUTH_STATUS_TIMEOUT_MS);

      checkProcess.stdout?.on('data', (data: Buffer | string) => {
        outputStr += data.toString();
      });

      checkProcess.on('close', (code) => {
        if (code !== 0) {
          finish(false);
          return;
        }
        try {
          const status = JSON.parse(outputStr) as { loggedIn?: boolean };
          finish(status.loggedIn === true);
        } catch {
          finish(false);
        }
      });

      checkProcess.on('error', () => {
        finish(false);
      });
    });
  }

  executePromptStreaming(
    prompt: string,
    _model: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!existsSync(PLAYGROUND_DIR)) {
        mkdirSync(PLAYGROUND_DIR, { recursive: true });
      }

      const args = [
        ...(this._hasSession ? ['--continue'] : []),
        '-p',
        prompt,
        '--dangerously-skip-permissions',
      ];
      for (const dir of this.getPlaygroundDirs()) {
        args.push('--add-dir', dir);
      }

      const token = this.getToken();
      const claudeProcess = spawn('claude', args, {
        env: {
          ...process.env,
          CLAUDE_CODE_OAUTH_TOKEN: token ?? '',
          BROWSER: '/bin/true',
          DISPLAY: '',
        },
        cwd: PLAYGROUND_DIR,
        shell: false,
      });
      claudeProcess.stdin?.end();

      let errorResult = '';

      claudeProcess.stdout?.on('data', (data: Buffer | string) => {
        onChunk(data.toString());
      });

      claudeProcess.stderr?.on('data', (data: Buffer | string) => {
        errorResult += data.toString();
      });

      claudeProcess.on('close', (code) => {
        if (code !== 0 && errorResult.trim()) {
          reject(new Error(errorResult || `Process exited with code ${code}`));
        } else {
          this._hasSession = true;
          resolve();
        }
      });

      claudeProcess.on('error', reject);
    });
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
