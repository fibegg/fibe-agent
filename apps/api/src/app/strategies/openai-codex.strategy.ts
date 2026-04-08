import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AuthConnection,
  ConversationDataDirProvider,
  LogoutConnection,
  StreamingCallbacks,
  TokenUsage,
  ToolEvent,
} from './strategy.types';
import { INTERRUPTED_MESSAGE } from './strategy.types';
import { AbstractCLIStrategy } from './abstract-cli.strategy';
import { runAuthProcess } from './auth-process-helper';

const DEFAULT_CODEX_HOME = join(process.env.HOME ?? '/home/node', '.codex');

const CODEX_WORKSPACE_SUBDIR = 'codex_workspace';
const CODEX_BIN_NAME = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const RESPONSE_PREVIEW_MAX = 200;

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

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*[a-zA-Z]/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, '');

/* ------------------------------------------------------------------ */
/*  Structured JSONL parser for `codex exec --json`                   */
/* ------------------------------------------------------------------ */

interface CodexJsonEvent {
  type?: string;
  message?: string;
  thread_id?: string;
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
  item?: {
    id?: string;
    type?: string;
    text?: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number | null;
    status?: string;
    changes?: Array<{ path?: string; kind?: string }>;
    name?: string;
    summary?: string;
    path?: string;
  };
}

export interface CodexExecJsonState {
  errorResult: string;
  inReasoning: boolean;
}

export interface CodexExecJsonHandlers {
  onChunk: (chunk: string) => void;
  onReasoningStart?: () => void;
  onReasoningChunk?: (text: string) => void;
  onReasoningEnd?: () => void;
  onTool?: (event: ToolEvent) => void;
  onUsage?: (usage: TokenUsage) => void;
}

/**
 * Parse a single JSONL line from `codex exec --json` and route into callbacks.
 *
 * Event flow:
 *   turn.started        → onReasoningStart  (opens activity entry)
 *   item: reasoning     → onReasoningChunk
 *   item: agent_message → onReasoningChunk (preview) + onReasoningEnd + onChunk
 *   item: command_exec  → onReasoningChunk + onTool
 *   item: file_change   → onReasoningChunk + onTool
 *   turn.completed      → onReasoningEnd + onUsage
 *   error / turn.failed → onChunk (prefixed with ⚠️)
 *   non-JSON            → onChunk (ANSI stripped)
 */
export function handleCodexExecJsonLine(
  line: string,
  state: CodexExecJsonState,
  handlers: CodexExecJsonHandlers
): void {
  line = line.trim();
  if (!line) return;

  const startReasoning = () => {
    if (state.inReasoning) return;
    state.inReasoning = true;
    handlers.onReasoningStart?.();
  };

  const endReasoning = () => {
    if (!state.inReasoning) return;
    handlers.onReasoningEnd?.();
    state.inReasoning = false;
  };

  try {
    const event = JSON.parse(line) as CodexJsonEvent;
    const type = event.type ?? '';

    if (type === 'turn.started') {
      startReasoning();
      return;
    }

    if (type.startsWith('item.') && event.item) {
      const item = event.item;

      switch (item.type) {
        case 'agent_message':
        case 'message': {
          if (!item.text) break;
          const preview = item.text.length > RESPONSE_PREVIEW_MAX
            ? item.text.slice(0, RESPONSE_PREVIEW_MAX) + '…'
            : item.text;
          handlers.onReasoningChunk?.(preview);
          endReasoning();
          handlers.onChunk(item.text);
          break;
        }

        case 'reasoning': {
          startReasoning();
          if (item.text) handlers.onReasoningChunk?.(item.text);
          break;
        }

        case 'command_execution': {
          if (!item.command) break;
          handlers.onReasoningChunk?.(`$ ${item.command}\n`);
          handlers.onTool?.({
            kind: 'tool_call',
            name: 'command',
            command: item.command,
            summary: item.aggregated_output?.slice(0, RESPONSE_PREVIEW_MAX),
            details: JSON.stringify({ command: item.command, output: item.aggregated_output }),
          });
          break;
        }

        case 'file_change': {
          for (const change of item.changes ?? []) {
            if (!change.path) continue;
            const fileName = change.path.split(/[/\\]/).pop() ?? 'file';
            handlers.onReasoningChunk?.(`${change.kind ?? 'changed'}: ${change.path}\n`);
            handlers.onTool?.({
              kind: 'file_created',
              name: fileName,
              path: change.path,
              summary: change.kind,
              details: JSON.stringify(change),
            });
          }
          break;
        }

        case 'local_shell_call':
        case 'function_call':
        case 'tool_call': {
          handlers.onTool?.({
            kind: 'tool_call',
            name: item.name ?? 'tool',
            command: item.command,
            path: item.path,
            summary: item.summary,
            details: JSON.stringify(item),
          });
          break;
        }

        default:
          break;
      }
      return;
    }

    if (type === 'turn.completed') {
      endReasoning();
      if (event.usage && handlers.onUsage) {
        handlers.onUsage({
          inputTokens: event.usage.input_tokens ?? 0,
          outputTokens: event.usage.output_tokens ?? 0,
        });
      }
      return;
    }

    if (type === 'turn.failed') {
      endReasoning();
      const msg = event.error?.message ?? 'Turn failed';
      state.errorResult += msg;
      handlers.onChunk(`⚠️ ${msg}`);
      return;
    }

    if (type === 'error') {
      const msg = event.message ?? event.error?.message ?? 'Unknown codex error';
      state.errorResult += msg;
      handlers.onChunk(`⚠️ ${msg}`);
      return;
    }
  } catch {
    const cleaned = stripAnsi(line).trim();
    if (cleaned) handlers.onChunk(cleaned);
  }
}

/* ------------------------------------------------------------------ */
/*  Strategy class                                                     */
/* ------------------------------------------------------------------ */

export class OpenaiCodexStrategy extends AbstractCLIStrategy {

  constructor(useApiTokenMode = false, conversationDataDir?: ConversationDataDirProvider) {
    super(OpenaiCodexStrategy.name, useApiTokenMode, conversationDataDir);
  }

  private getCodexHomeForSession(): string {
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
        writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({ api_key: key }), { mode: 0o600 });
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
        const urlMatch = clean.match(/https:\/\/[^\s"'> ]+/);
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



  submitAuthCode(code: string): void {
    const trimmed = (code ?? '').trim();
    if (!trimmed) return;
    if (this.activeAuthProcess?.stdin) {
      this.activeAuthProcess.stdin.write(trimmed + '\n');
    }
  }

  clearCredentials(): void {
    const authFile = join(this.getCodexHomeForSession(), 'auth.json');
    if (existsSync(authFile)) unlinkSync(authFile);
  }

  executeLogout(connection: LogoutConnection): void {
    const env = { ...process.env, CODEX_HOME: this.getCodexHomeForSession() };
    const logoutProcess = spawn(getCodexCommand(), ['logout'], { env, shell: false });

    const handleOutput = (data: Buffer | string) => connection.sendLogoutOutput(data.toString());
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
      if (!existsSync(authFile)) { resolve(false); return; }
      try {
        const auth = JSON.parse(readFileSync(authFile, 'utf8')) as Record<string, string>;
        resolve(Boolean(auth?.access_token ?? auth?.token ?? auth?.api_key));
      } catch {
        resolve(false);
      }
    });
  }



  executePromptStreaming(
    prompt: string,
    _model: string,
    onChunk: (chunk: string) => void,
    callbacks?: StreamingCallbacks,
    systemPrompt?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.streamInterrupted = false;
      if (this.useApiTokenMode) this.ensureSettings();

      const playgroundDir = this.getWorkingDir();
      if (!existsSync(playgroundDir)) mkdirSync(playgroundDir, { recursive: true });

      const effectivePrompt = systemPrompt ? `${systemPrompt}\n${prompt}` : prompt;
      const codexProcess = spawn(
        getCodexCommand(),
        ['exec', '--json', '--color', 'never', '--dangerously-bypass-approvals-and-sandbox', effectivePrompt],
        { env: { ...process.env, CODEX_HOME: this.getCodexHomeForSession() }, cwd: playgroundDir, shell: false }
      );
      this.currentStreamProcess = codexProcess;

      let errorResult = '';
      let lineBuffer = '';
      let stderrReasoningStarted = false;
      const jsonState: CodexExecJsonState = { errorResult: '', inReasoning: false };

      const handleJsonLine = (raw: string) => {
        handleCodexExecJsonLine(raw, jsonState, {
          onChunk,
          onReasoningStart: callbacks?.onReasoningStart,
          onReasoningChunk: callbacks?.onReasoningChunk,
          onReasoningEnd: callbacks?.onReasoningEnd,
          onTool: callbacks?.onTool,
          onUsage: callbacks?.onUsage,
        });
        errorResult = jsonState.errorResult;
      };

      codexProcess.stdout?.on('data', (data: Buffer | string) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const l of lines) handleJsonLine(l);
      });

      codexProcess.stderr?.on('data', (data: Buffer | string) => {
        const text = stripAnsi(data.toString());
        errorResult += text;
        if (callbacks?.onReasoningChunk) {
          if (!stderrReasoningStarted && !jsonState.inReasoning) {
            stderrReasoningStarted = true;
            callbacks.onReasoningStart?.();
          }
          callbacks.onReasoningChunk(text);
        }
      });

      codexProcess.on('close', (code) => {
        this.currentStreamProcess = null;
        if (lineBuffer.trim()) handleJsonLine(lineBuffer);
        if (jsonState.inReasoning || stderrReasoningStarted) callbacks?.onReasoningEnd?.();
        if (this.streamInterrupted) { reject(new Error(INTERRUPTED_MESSAGE)); return; }
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
