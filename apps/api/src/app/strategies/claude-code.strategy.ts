import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthConnection, ConversationDataDirProvider, LogoutConnection, ToolEvent } from './strategy.types';
import { INTERRUPTED_MESSAGE, type AgentStrategy } from './strategy.types';

const ENV_TOKEN_VARS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'] as const;

function getClaudeConfigDir(): string {
  return join(process.env.HOME ?? '/home/node', '.claude');
}

function getTokenFilePath(): string {
  return join(getClaudeConfigDir(), 'agent_token.txt');
}
const PLAYGROUND_DIR = join(process.cwd(), 'playground');
const CLAUDE_WORKSPACE_SUBDIR = 'claude_workspace';
const SESSION_MARKER_FILE = '.claude_session';

const FILE_WRITING_TOOL_NAMES = ['write_file', 'edit_file', 'search_replace'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
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

export class ClaudeCodeStrategy implements AgentStrategy {
  private currentConnection: AuthConnection | null = null;
  private _hasSession = false;
  private currentStreamProcess: ChildProcess | null = null;
  private streamInterrupted = false;
  private readonly useApiTokenMode: boolean;
  private readonly conversationDataDir: ConversationDataDirProvider | undefined;

  constructor(useApiTokenMode = false, conversationDataDir?: ConversationDataDirProvider) {
    this.useApiTokenMode = useApiTokenMode;
    this.conversationDataDir = conversationDataDir;
  }

  private getClaudeWorkspaceDir(): string {
    if (this.conversationDataDir) {
      return join(this.conversationDataDir.getConversationDataDir(), CLAUDE_WORKSPACE_SUBDIR);
    }
    return PLAYGROUND_DIR;
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

  cancelAuth(): void {
    this.currentConnection = null;
  }

  clearCredentials(): void {
    const tokenPath = getTokenFilePath();
    if (existsSync(tokenPath)) {
      rmSync(tokenPath, { force: true });
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

    if (this.useApiTokenMode) {
      return Promise.resolve(this.getToken() !== null);
    }

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
      const workspaceDir = this.getClaudeWorkspaceDir();
      if (!existsSync(workspaceDir)) {
        mkdirSync(workspaceDir, { recursive: true });
      }
      if (this.conversationDataDir) {
        this._hasSession = existsSync(join(workspaceDir, SESSION_MARKER_FILE));
      }

      const useStreamJson = !!callbacks;
      const args = [
        ...(this._hasSession ? ['--continue'] : []),
        '-p',
        prompt,
        '--dangerously-skip-permissions',
        ...(systemPrompt ? ['--system-prompt', systemPrompt] : []),
        ...(useStreamJson
          ? ['--output-format', 'stream-json', '--include-partial-messages', '--verbose']
          : []),
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
        cwd: workspaceDir,
        shell: false,
      });
      this.currentStreamProcess = claudeProcess;
      claudeProcess.stdin?.end();

      let errorResult = '';
      let stdoutBuffer = '';
      let inThinking = false;
      let streamUsage: { inputTokens: number; outputTokens: number } | null = null;

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
            event?: {
              type?: string;
              index?: number;
              delta?: { type?: string; text?: string; thinking?: string };
              content_block?: { type?: string; name?: string; input?: unknown };
              message?: { usage?: { input_tokens?: number; output_tokens?: number } };
              usage?: { input_tokens?: number; output_tokens?: number };
            };
          };
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
              onChunk(ev.delta.text);
            }
            if (ev.delta.type === 'thinking_delta') {
              const thinkingChunk = ev.delta.thinking ?? ev.delta.text ?? '';
              if (thinkingChunk) {
                if (!inThinking) {
                  inThinking = true;
                  callbacks?.onReasoningStart?.();
                }
                callbacks?.onReasoningChunk?.(thinkingChunk);
              }
            }
          }
          if (ev.type === 'content_block_stop' && inThinking) {
            callbacks?.onReasoningEnd?.();
            inThinking = false;
          }
          if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
            const cb = ev.content_block;
            const input = cb.input && typeof cb.input === 'object' ? (cb.input as Record<string, unknown>) : undefined;
            callbacks?.onTool?.(toolUseToEvent(cb, input));
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
        if (code !== 0 && errorResult.trim()) {
          reject(new Error(errorResult || `Process exited with code ${code}`));
        } else {
          this._hasSession = true;
          if (this.conversationDataDir) {
            try {
              writeFileSync(join(workspaceDir, SESSION_MARKER_FILE), '');
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
}
