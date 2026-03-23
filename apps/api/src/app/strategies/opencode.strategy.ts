import { Logger } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthConnection, ConversationDataDirProvider, LogoutConnection } from './strategy.types';
import { INTERRUPTED_MESSAGE, type AgentStrategy } from './strategy.types';

const PLAYGROUND_DIR = join(process.cwd(), 'playground');
const OPENCODE_WORKSPACE_SUBDIR = 'opencode_workspace';
const SESSION_MARKER_FILE = '.opencode_session';

/**
 * Well-known API key env vars that OpenCode CLI can read.
 * If ANY of these are set in process.env, the auth modal is skipped.
 */
const API_KEY_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
] as const;

function opencodeDataDir(): string {
  return join(process.env.HOME ?? '/home/node', '.local', 'share', 'opencode');
}

function opencodeAuthFile(): string {
  return join(opencodeDataDir(), 'auth.json');
}

/**
 * Returns true if at least one well-known API key env var is set.
 */
function hasEnvApiKey(): boolean {
  return API_KEY_ENV_VARS.some((k) => !!process.env[k]?.trim());
}

export class OpencodeStrategy implements AgentStrategy {
  private readonly logger = new Logger(OpencodeStrategy.name);
  private currentConnection: AuthConnection | null = null;
  private currentStreamProcess: ChildProcess | null = null;
  private streamInterrupted = false;
  private readonly conversationDataDir: ConversationDataDirProvider | undefined;

  constructor(conversationDataDir?: ConversationDataDirProvider) {
    this.conversationDataDir = conversationDataDir;
  }

  private getOpencodeWorkspaceDir(): string {
    if (this.conversationDataDir) {
      return join(this.conversationDataDir.getConversationDataDir(), OPENCODE_WORKSPACE_SUBDIR);
    }
    return PLAYGROUND_DIR;
  }

  getWorkingDir(): string {
    return this.getOpencodeWorkspaceDir();
  }

  /**
   * Reads a manually stored API key from the auth file (set via auth modal).
   */
  private getStoredApiKey(): string | null {
    const authFile = opencodeAuthFile();
    if (!existsSync(authFile)) return null;
    try {
      const content = readFileSync(authFile, 'utf8');
      const auth = JSON.parse(content) as { api_key?: string };
      return auth?.api_key?.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Returns true when authenticated — either via env vars OR stored key.
   */
  checkAuthStatus(): Promise<boolean> {
    return Promise.resolve(hasEnvApiKey() || this.getStoredApiKey() !== null);
  }

  /**
   * If env vars are already set, immediately signal success (no modal).
   * Otherwise, show the manual token input modal.
   */
  executeAuth(connection: AuthConnection): void {
    this.currentConnection = connection;

    if (hasEnvApiKey()) {
      this.logger.log('API key found in environment — skipping auth modal');
      connection.sendAuthSuccess();
      return;
    }

    connection.sendAuthManualToken();
  }

  submitAuthCode(code: string): void {
    const trimmed = (code ?? '').trim();
    if (trimmed) {
      const dataDir = opencodeDataDir();
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      writeFileSync(
        opencodeAuthFile(),
        JSON.stringify({ api_key: trimmed }),
        { mode: 0o600 }
      );
      if (this.currentConnection) {
        this.currentConnection.sendAuthSuccess();
      }
    } else {
      this.currentConnection?.sendAuthStatus('unauthenticated');
    }
  }

  cancelAuth(): void {
    this.currentConnection = null;
  }

  clearCredentials(): void {
    const authFile = opencodeAuthFile();
    if (existsSync(authFile)) {
      rmSync(authFile, { force: true });
    }
  }

  executeLogout(connection: LogoutConnection): void {
    this.clearCredentials();
    connection.sendLogoutSuccess();
  }

  getModelArgs(model: string): string[] {
    if (!model || model === 'undefined') return [];

    let resolved = model;

    // When OpenRouter is the active provider, ensure the model ID has
    // the openrouter/ prefix that opencode expects (e.g. openrouter/openai/gpt-5.4).
    // This lets MODEL_OPTIONS and custom model input use short forms like openai/gpt-5.4.
    if (
      !resolved.startsWith('openrouter/') &&
      (process.env.OPENROUTER_API_KEY?.trim() || this.isStoredKeyActive())
    ) {
      resolved = `openrouter/${resolved}`;
    }

    return ['--model', resolved];
  }

  /**
   * Returns true when a manually-stored key is the only credential source
   * (meaning the user pasted an OpenRouter key via the auth modal).
   */
  private isStoredKeyActive(): boolean {
    return !hasEnvApiKey() && this.getStoredApiKey() !== null;
  }

  private static readonly LIST_MODELS_TIMEOUT_MS = 15_000;

  listModels(): Promise<string[]> {
    return new Promise((resolve) => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      const storedKey = this.getStoredApiKey();
      if (storedKey) {
        for (const varName of API_KEY_ENV_VARS) {
          if (!env[varName]?.trim()) {
            env[varName] = storedKey;
          }
        }
      }

      let stdout = '';
      const proc = spawn('opencode', ['models'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        proc.kill();
        this.logger.warn('opencode models timed out');
        resolve([]);
      }, OpencodeStrategy.LIST_MODELS_TIMEOUT_MS);

      proc.stdout?.on('data', (data: Buffer | string) => {
        stdout += data.toString();
      });

      proc.on('close', () => {
        clearTimeout(timer);
        const models = stdout
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        resolve(models);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        this.logger.warn('opencode models failed', err.message);
        resolve([]);
      });
    });
  }

  interruptAgent(): void {
    this.streamInterrupted = true;
    this.currentStreamProcess?.kill();
  }

  executePromptStreaming(
    prompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    callbacks?: import('./strategy.types').StreamingCallbacks,
    systemPrompt?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.streamInterrupted = false;
      const workspaceDir = this.getOpencodeWorkspaceDir();
      if (!existsSync(workspaceDir)) {
        mkdirSync(workspaceDir, { recursive: true });
      }
      const hasSession = this.conversationDataDir
        ? existsSync(join(workspaceDir, SESSION_MARKER_FILE))
        : false;

      const effectivePrompt = systemPrompt ? `${systemPrompt}\n${prompt}` : prompt;
      const opencodeArgs = [
        'run',
        ...(hasSession ? ['--continue'] : []),
        '--format', 'json',
        '--thinking',
        ...this.getModelArgs(model),
        effectivePrompt,
      ];

      // Build env: start with process.env (inherits pre-set keys like
      // ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, etc.).
      // If a manual key was stored via the auth modal, inject it into
      // all common env vars so opencode can use any provider.
      const env: NodeJS.ProcessEnv = { ...process.env };
      const storedKey = this.getStoredApiKey();

      if (storedKey) {
        // Only set env vars that are NOT already set — env takes priority
        for (const varName of API_KEY_ENV_VARS) {
          if (!env[varName]?.trim()) {
            env[varName] = storedKey;
          }
        }
        // Default to OpenRouter base URL when using stored key
        // (unless user already configured a custom base)
        if (!env['OPENAI_API_BASE']?.trim()) {
          env['OPENAI_API_BASE'] = 'https://openrouter.ai/api/v1';
        }
      }

      if (!hasEnvApiKey() && !storedKey) {
        reject(new Error('Not authenticated. Please provide an API key first.'));
        return;
      }

      this.logger.log(`Spawning opencode: model=${model || '(default)'}`);

      const opencodeProcess = spawn('opencode', opencodeArgs, {
        env,
        cwd: workspaceDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.currentStreamProcess = opencodeProcess;

      let errorResult = '';
      let lineBuffer = '';

      /** Strip ANSI escape sequences so sidebar output is clean. */
      // eslint-disable-next-line no-control-regex
      const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');

      opencodeProcess.stdout?.on('data', (data: Buffer | string) => {
        // OpenCode --format json outputs NDJSON (one JSON object per line)
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed) as {
              type: string;
              error?: { name?: string; data?: { message?: string } };
              part?: {
                type?: string;
                text?: string;
                name?: string;
                summary?: string;
                path?: string;
              };
            };

            switch (event.type) {
              case 'text':
                if (event.part?.text) {
                  onChunk(event.part.text);
                }
                break;
              case 'tool_call':
                if (callbacks?.onTool && event.part) {
                  callbacks.onTool({
                    kind: 'tool_call',
                    name: event.part.name ?? 'tool',
                    path: event.part.path,
                    summary: event.part.summary,
                  });
                }
                break;
              case 'step_start':
                callbacks?.onReasoningChunk?.('Thinking…\n');
                break;
              case 'thinking':
                if (event.part?.text && callbacks?.onReasoningChunk) {
                  callbacks.onReasoningChunk(event.part.text);
                }
                break;
              case 'step_finish':
                callbacks?.onReasoningEnd?.();
                break;
              case 'error': {
                const msg = event.error?.data?.message
                  ?? event.error?.name
                  ?? 'Unknown opencode error';
                errorResult += msg;
                onChunk(`⚠️ ${msg}`);
                break;
              }
              default:
                // Other event types (e.g. tool_result) — ignore
                break;
            }
          } catch {
            // Non-JSON line — pass through as raw text
            onChunk(trimmed);
          }
        }
      });

      opencodeProcess.stderr?.on('data', (data: Buffer | string) => {
        const text = stripAnsi(data.toString());
        errorResult += text;
        if (callbacks?.onReasoningChunk) {
          callbacks.onReasoningChunk(text);
        }
      });

      opencodeProcess.on('close', (code) => {
        this.currentStreamProcess = null;
        if (lineBuffer.trim()) {
          try {
            const event = JSON.parse(lineBuffer.trim()) as {
              type: string;
              part?: { text?: string };
            };
            if (event.type === 'text' && event.part?.text) {
              onChunk(event.part.text);
            }
          } catch {
            onChunk(lineBuffer.trim());
          }
        }

        callbacks?.onReasoningEnd?.();
        if (this.streamInterrupted) {
          reject(new Error(INTERRUPTED_MESSAGE));
          return;
        }
        if (code !== 0 && code !== null) {
          reject(new Error(errorResult.trim() || `Process exited with code ${code}`));
        } else {
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

      opencodeProcess.on('error', (err) => {
        this.currentStreamProcess = null;
        this.logger.error('OpenCode process error', err);
        reject(err);
      });
    });
  }
}
