import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuthConnection, ConversationDataDirProvider, LogoutConnection, ToolEvent } from './strategy.types';
import { INTERRUPTED_MESSAGE } from './strategy.types';
import { AbstractCLIStrategy } from './abstract-cli.strategy';

const ENV_TOKEN_VARS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'] as const;

function getClaudeConfigDir(): string {
  return process.env.SESSION_DIR || join(process.env.HOME ?? '/home/node', '.claude');
}

function getClaudeHomeDir(): string {
  const sessionDir = process.env.SESSION_DIR;
  return sessionDir ? dirname(sessionDir) : (process.env.HOME ?? '/home/node');
}

function getClaudeXdgEnv(): Record<string, string> {
  if (!process.env.SESSION_DIR) return {};
  const homeDir = getClaudeHomeDir();
  return {
    XDG_CONFIG_HOME: join(homeDir, '.config'),
    XDG_DATA_HOME: join(homeDir, '.local', 'share'),
    XDG_STATE_HOME: join(homeDir, '.local', 'state'),
    XDG_CACHE_HOME: join(homeDir, '.cache'),
  };
}

function getTokenFilePath(): string {
  return join(getClaudeConfigDir(), 'agent_token.txt');
}
const PLAYGROUND_DIR = join(process.cwd(), 'playground');
const CLAUDE_WORKSPACE_SUBDIR = 'claude_workspace';
const SESSION_MARKER_FILE = '.claude_session';
const MISSING_SESSION_ERROR_PATTERNS = [
  /No conversation found with session ID:/i,
];

const FILE_WRITING_TOOL_NAMES = ['write_file', 'edit_file', 'search_replace'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function missingSessionError(message: string): boolean {
  return MISSING_SESSION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function buildCommandFromInput(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const argsObj = input.arguments && typeof input.arguments === 'object' ? (input.arguments as Record<string, unknown>) : undefined;
  const base =
    typeof input.command === 'string'
      ? input.command
      : typeof argsObj?.command === 'string'
        ? argsObj.command
        : undefined;
  const extraArgs = isStringArray(input.args)
    ? input.args
    : isStringArray(argsObj?.args)
      ? argsObj.args
      : isStringArray(input.arguments)
        ? input.arguments
        : undefined;
  if (base && extraArgs?.length) return `${base.trim()} ${extraArgs.join(' ')}`.trim();
  if (base) return base;
  if (extraArgs?.length) return extraArgs.join(' ');
  return undefined;
}

export function toolUseToEvent(
  cb: { name?: string; input?: unknown },
  input: Record<string, unknown> | undefined
): ToolEvent {
  const command = buildCommandFromInput(input);
  const summary =
    input && !command ? JSON.stringify(input).slice(0, 200) : undefined;
  const details =
    input && typeof input === 'object' ? JSON.stringify(input).slice(0, 500) : undefined;
  const isFileTool = FILE_WRITING_TOOL_NAMES.includes((cb.name ?? '').toLowerCase());
  const pathFromInput =
    typeof input?.path === 'string'
      ? input.path
      : typeof input?.file_path === 'string'
        ? input.file_path
        : typeof input?.path_input === 'string'
          ? input.path_input
          : typeof input?.name === 'string' && isFileTool
            ? input.name
            : undefined;
  if (isFileTool && (pathFromInput ?? cb.name)) {
    return {
      kind: 'file_created',
      name: (pathFromInput ? pathFromInput.split(/[/\\]/).pop() : undefined) ?? cb.name ?? 'file',
      path: pathFromInput ?? cb.name,
      summary,
    };
  }
  return {
    kind: 'tool_call',
    name: cb.name ?? 'tool',
    summary,
    command,
    details,
  };
}

export class ClaudeCodeStrategy extends AbstractCLIStrategy {
  private _hasSession = false;
  private _sessionId: string | null = null;
  private _pendingAuthCheck: Promise<boolean> | null = null;

  constructor(useApiTokenMode = false, conversationDataDir?: ConversationDataDirProvider) {
    super(ClaudeCodeStrategy.name, useApiTokenMode, conversationDataDir);
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

  private clearStoredSession(workspaceDir?: string): void {
    this._hasSession = false;
    this._sessionId = null;
    if (!this.conversationDataDir) return;
    try {
      rmSync(join(workspaceDir ?? this.getClaudeWorkspaceDir(), SESSION_MARKER_FILE), { force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }

  private getEnvToken(): string | null {
    for (const key of ENV_TOKEN_VARS) {
      const value = process.env[key];
      if (value && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private getToken(): string | null {
    if (this.useApiTokenMode) {
      const envToken = this.getEnvToken();
      if (envToken) return envToken;
    }
    const tokenPath = getTokenFilePath();
    if (existsSync(tokenPath)) {
      return readFileSync(tokenPath, 'utf8').trim();
    }
    return null;
  }

  private getClaudeProcessEnv(extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...this.getProxyEnv(),
      HOME: getClaudeHomeDir(),
      ...getClaudeXdgEnv(),
      ...extraEnv,
    };
  }

  executeAuth(connection: AuthConnection): void {
    this.currentConnection = connection;
    const token = this.getToken();
    if (this.useApiTokenMode) {
      if (token) {
        this._hasSession = true;
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
    if (trimmed) {
      const configDir = getClaudeConfigDir();
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      writeFileSync(getTokenFilePath(), trimmed, { mode: 0o600 });
      if (this.currentConnection) {
        this.currentConnection.sendAuthSuccess();
      }
      this._hasSession = true;
    } else {
      this.currentConnection?.sendAuthStatus('unauthenticated');
    }
  }



  clearCredentials(): void {
    const tokenPath = getTokenFilePath();
    if (existsSync(tokenPath)) {
      rmSync(tokenPath, { force: true });
    }
  }

  executeLogout(connection: LogoutConnection): void {
    const token = this.getToken();
    const envOverrides: Record<string, string> = {};
    if (token) {
      envOverrides.CLAUDE_CODE_OAUTH_TOKEN = token;
    }
    const logoutProcess = spawn('claude', ['auth', 'logout'], {
      env: this.getClaudeProcessEnv(envOverrides),
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

    if (this.useApiTokenMode) {
      return Promise.resolve(this.getToken() !== null);
    }

    if (this.currentStreamProcess) {
      return Promise.resolve(true);
    }

    const token = this.getToken();

    if (this._pendingAuthCheck) {
      return this._pendingAuthCheck;
    }

    this._pendingAuthCheck = new Promise<boolean>((resolve) => {
      const envOverrides: Record<string, string> = {};
      if (token) {
        envOverrides.CLAUDE_CODE_OAUTH_TOKEN = token;
      }
      
      const checkProcess = spawn('claude', ['auth', 'status'], {
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
          // Claude CLI v2.1.119+ emits ANSI/VT terminal escape sequences around
          // the JSON output (e.g. \x1b7, \x1b8, \x1b[>4m). Strip them before parsing.
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

      checkProcess.on('error', () => {
        finish(false);
      });
    });

    return this._pendingAuthCheck;
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
      const workspaceDir = this.getClaudeWorkspaceDir();
      if (!existsSync(workspaceDir)) {
        mkdirSync(workspaceDir, { recursive: true });
      }
      if (this.conversationDataDir) {
        const markerPath = join(workspaceDir, SESSION_MARKER_FILE);
        if (existsSync(markerPath)) {
          const stored = readFileSync(markerPath, 'utf8').trim();
          this._sessionId = stored || null;
          this._hasSession = true;
        }
      }

      const useStreamJson = !!callbacks;
      const mcpConfigPath = join(workspaceDir, '.mcp.json');
      const args = [
        ...(this._sessionId
          ? ['--resume', this._sessionId]
          : this._hasSession
            ? ['--continue']
            : []),
        '-p',
        prompt,
        '--dangerously-skip-permissions',
        ...(existsSync(mcpConfigPath) ? ['--mcp-config', mcpConfigPath] : []),
        ...(systemPrompt ? ['--system-prompt', systemPrompt.trim()] : []),
        ...(useStreamJson
          ? [
              '--output-format',
              'stream-json',
              '--include-partial-messages',
              '--verbose',
            ]
          : []),
      ];
      for (const dir of this.getPlaygroundDirs()) {
        args.push('--add-dir', dir);
      }

      const token = this.getToken();
      
      const envOverrides: Record<string, string> = {
        BROWSER: '/bin/true',
        DISPLAY: '',
      };
      if (token) {
        envOverrides.CLAUDE_CODE_OAUTH_TOKEN = token;
      }

      const claudeProcess = spawn('claude', args, {
        env: this.getClaudeProcessEnv(envOverrides),
        cwd: workspaceDir,
        shell: false,
      });
      this.currentStreamProcess = claudeProcess;
      claudeProcess.stdin?.end();

      let errorResult = '';
      let stdoutBuffer = '';
      let inThinking = false;
      let streamUsage: { inputTokens: number; outputTokens: number } | null = null;
      let capturedSessionId: string | null = null;
      let currentToolBlock: { name?: string; inputStr: string } | null = null;
      let hasEmittedOutput = false;

      const applyUsage = (u: { input_tokens?: number; output_tokens?: number } | undefined) => {
        if (!u) return;
        const inT = typeof u.input_tokens === 'number' ? u.input_tokens : streamUsage?.inputTokens ?? 0;
        const outT = typeof u.output_tokens === 'number' ? u.output_tokens : streamUsage?.outputTokens ?? 0;
        streamUsage = { inputTokens: inT, outputTokens: outT };
      };

      const handleStreamJsonLine = (line: string) => {
        line = line.trim();
        if (!line) return;
        try {
          const obj = JSON.parse(line) as {
            type?: string;
            session_id?: string;
            event?: {
              type?: string;
              index?: number;
              delta?: { type?: string; text?: string; thinking?: string; partial_json?: string };
              content_block?: { type?: string; name?: string; input?: unknown };
              message?: { usage?: { input_tokens?: number; output_tokens?: number } };
              usage?: { input_tokens?: number; output_tokens?: number };
            };
          };
          if (!capturedSessionId && obj.session_id) {
            capturedSessionId = obj.session_id;
          }
          if (obj.type === 'message_start') {
            const msg = (obj as { message?: { usage?: { input_tokens?: number; output_tokens?: number } } }).message;
            if (msg?.usage) applyUsage(msg.usage);
          }
          if (obj.type === 'message_delta') {
            const u = (obj as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
            if (u) applyUsage(u);
          }
          if (obj.type === 'message_stop' && streamUsage) {
            callbacks?.onUsage?.({ inputTokens: streamUsage.inputTokens, outputTokens: streamUsage.outputTokens });
          }
          if (obj.type !== 'stream_event' || !obj.event) return;
          const ev = obj.event;
          if (ev.type === 'message_start' && ev.message?.usage) {
            applyUsage(ev.message.usage);
          }
          if (ev.type === 'message_delta' && ev.usage) {
            applyUsage(ev.usage);
          }
          if (ev.type === 'message_stop' && streamUsage) {
            callbacks?.onUsage?.({ inputTokens: streamUsage.inputTokens, outputTokens: streamUsage.outputTokens });
          }
          if (ev.type === 'content_block_delta' && ev.delta) {
            if (ev.delta.type === 'text_delta' && ev.delta.text) {
              if (inThinking) {
                callbacks?.onReasoningEnd?.();
                inThinking = false;
              }
              hasEmittedOutput = true;
              onChunk(ev.delta.text);
            }
            if (ev.delta.type === 'thinking_delta') {
              const thinkingChunk = ev.delta.thinking ?? ev.delta.text ?? '';
              if (thinkingChunk) {
                if (!inThinking) {
                  inThinking = true;
                  callbacks?.onReasoningStart?.();
                }
                hasEmittedOutput = true;
                callbacks?.onReasoningChunk?.(thinkingChunk);
              }
            }
            if (ev.delta.type === 'input_json_delta' && currentToolBlock) {
              currentToolBlock.inputStr += ev.delta.partial_json || '';
            }
          }
          if (ev.type === 'content_block_stop') {
            if (inThinking) {
              callbacks?.onReasoningEnd?.();
              inThinking = false;
            } else if (currentToolBlock) {
              const cb = { name: currentToolBlock.name };
              let input: Record<string, unknown> | undefined;
              try {
                if (currentToolBlock.inputStr.trim()) {
                  input = JSON.parse(currentToolBlock.inputStr) as Record<string, unknown>;
                }
              } catch {
                /* ignore */
              }
              hasEmittedOutput = true;
              callbacks?.onTool?.(toolUseToEvent(cb, input));
              currentToolBlock = null;
            }
          }
          if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
            currentToolBlock = { name: ev.content_block.name, inputStr: '' };
          }
        } catch {
          /* ignore malformed lines */
        }
      };

      claudeProcess.stdout?.on('data', (data: Buffer | string) => {
        const str = data.toString();
        if (useStreamJson) {
          stdoutBuffer += str;
          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop() ?? '';
          for (const line of lines) handleStreamJsonLine(line);
        } else {
          if (str.trim()) hasEmittedOutput = true;
          onChunk(str);
        }
      });

      claudeProcess.stderr?.on('data', (data: Buffer | string) => {
        errorResult += data.toString();
      });

      claudeProcess.on('close', (code) => {
        this.currentStreamProcess = null;
        if (useStreamJson && stdoutBuffer.trim()) handleStreamJsonLine(stdoutBuffer);
        if (this.streamInterrupted) {
          reject(new Error(INTERRUPTED_MESSAGE));
          return;
        }
        if (code !== 0) {
          if (missingSessionError(errorResult)) {
            this.clearStoredSession(workspaceDir);
          }
          // Try to extract an error from stdout if stderr is empty
          let fallbackError = errorResult;
          if (!fallbackError.trim() && stdoutBuffer.trim()) {
            try {
               const lines = stdoutBuffer.trim().split('\n');
               const lastObj = JSON.parse(lines.pop() || '');
               if (lastObj && lastObj.error) fallbackError = typeof lastObj.error === 'string' ? lastObj.error : JSON.stringify(lastObj.error);
               if (!fallbackError && lastObj && lastObj.result && typeof lastObj.result === 'string') fallbackError = lastObj.result;
            } catch {
               const cleanOut = stdoutBuffer.trim();
               if (cleanOut) {
                   fallbackError = cleanOut.length > 300 ? cleanOut.slice(-300) + '...' : cleanOut;
               }
            }
          }
          reject(new Error(fallbackError.trim() || `Process exited with code ${code}`));
        } else if (!hasEmittedOutput) {
          this.clearStoredSession(workspaceDir);
          reject(new Error('Agent process completed successfully but returned no output. Session not saved to prevent corruption.'));
        } else {
          this._hasSession = true;
          if (capturedSessionId) {
            this._sessionId = capturedSessionId;
          }
          if (this.conversationDataDir) {
            try {
              writeFileSync(join(workspaceDir, SESSION_MARKER_FILE), this._sessionId ?? '');
            } catch {
              /* ignore */
            }
          }
          resolve();
        }
      });

      claudeProcess.on('error', (err) => {
        this.currentStreamProcess = null;
        reject(err);
      });
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

  hasNativeSessionSupport(): boolean {
    return true;
  }
}
