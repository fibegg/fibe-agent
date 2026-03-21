/**
 * Spawn-based tests for OpencodeStrategy.
 * Uses Bun's mock.module() + dynamic import pattern to intercept spawn.
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const OPENCODE_SPAWN_TEST_HOME = join(tmpdir(), `opencode-spawn-test-${process.pid}`);

function makeFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: () => void };
    kill: () => void;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { end: () => undefined };
  proc.kill = () => undefined;
  return proc;
}

let currentFakeProc = makeFakeProcess();

mock.module('node:child_process', () => ({
  spawn: (_cmd: string, _args: string[], _opts?: Record<string, unknown>) => currentFakeProc,
  execSync: () => '',
}));

const { OpencodeStrategy } = await import('./opencode.strategy');

describe('OpencodeStrategy spawn-mocked paths', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const ENV_KEYS = ['HOME', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_BASE'] as const;

  beforeEach(() => {
    currentFakeProc = makeFakeProcess();
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.HOME = OPENCODE_SPAWN_TEST_HOME;
    for (const k of ENV_KEYS.slice(1)) delete process.env[k];
    if (!existsSync(OPENCODE_SPAWN_TEST_HOME)) mkdirSync(OPENCODE_SPAWN_TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    if (existsSync(OPENCODE_SPAWN_TEST_HOME)) rmSync(OPENCODE_SPAWN_TEST_HOME, { recursive: true, force: true });
  });

  // ─── listModels ─────────────────────────────────────────────

  test('listModels returns parsed list of models on success', async () => {
    const strategy = new OpencodeStrategy();
    const promise = strategy.listModels();
    currentFakeProc.stdout.emit('data', 'anthropic/claude-3-5-sonnet\nopenai/gpt-4o\n');
    currentFakeProc.emit('close');
    const models = await promise;
    expect(models).toContain('anthropic/claude-3-5-sonnet');
    expect(models).toContain('openai/gpt-4o');
  });

  test('listModels returns empty array on process error', async () => {
    const strategy = new OpencodeStrategy();
    const promise = strategy.listModels();
    currentFakeProc.emit('error', new Error('spawn failed'));
    const models = await promise;
    expect(models).toEqual([]);
  });

  test('listModels returns empty array on empty output', async () => {
    const strategy = new OpencodeStrategy();
    const promise = strategy.listModels();
    currentFakeProc.stdout.emit('data', '   \n   \n');
    currentFakeProc.emit('close');
    const models = await promise;
    expect(models).toEqual([]);
  });

  test('listModels injects stored key into env', async () => {
    const strategy = new OpencodeStrategy();
    const noop = () => undefined;
    strategy.executeAuth({
      sendAuthManualToken: noop,
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    } as never);
    strategy.submitAuthCode('stored-openrouter-key');
    const promise = strategy.listModels();
    currentFakeProc.stdout.emit('data', 'model1\n');
    currentFakeProc.emit('close');
    const models = await promise;
    expect(models).toContain('model1');
  });

  // ─── executePromptStreaming ─────────────────────────────────

  test('executePromptStreaming rejects when not authenticated', async () => {
    const strategy = new OpencodeStrategy();
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    await expect(promise).rejects.toThrow('Not authenticated');
  });

  test('executePromptStreaming resolves on exit 0 with text event', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const chunks: string[] = [];
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c));
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'text', part: { text: 'response text' } }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks).toContain('response text');
  });

  test('executePromptStreaming resolves on exit null', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('close', null);
    await promise;
  });

  test('executePromptStreaming handles tool_call event', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const toolEvents: unknown[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: (e: unknown) => toolEvents.push(e),
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'tool_call', part: { name: 'list_files', summary: 'listing files', path: '/tmp' } }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(toolEvents.length).toBeGreaterThan(0);
  });

  test('executePromptStreaming handles step_start event for reasoning', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const reasoningChunks: string[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: (c: string) => reasoningChunks.push(c),
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'step_start' }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(reasoningChunks).toContain('Thinking…\n');
  });

  test('executePromptStreaming handles thinking event', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const reasoningChunks: string[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: (c: string) => reasoningChunks.push(c),
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'thinking', part: { text: 'I am thinking...' } }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(reasoningChunks).toContain('I am thinking...');
  });

  test('executePromptStreaming handles step_finish event', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    let reasoningEnded = false;
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => { reasoningEnded = true; },
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'step_finish' }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(reasoningEnded).toBe(true);
  });

  test('executePromptStreaming handles error event in JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const chunks: string[] = [];
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c));
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'error', error: { name: 'ApiError', data: { message: 'API limit exceeded' } } }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks.some((c) => c.includes('API limit exceeded'))).toBe(true);
  });

  test('executePromptStreaming handles non-JSON line as raw text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const chunks: string[] = [];
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c));
    currentFakeProc.stdout.emit('data', 'raw output line\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks).toContain('raw output line');
  });

  test('executePromptStreaming handles unknown event types without throwing', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'tool_result', data: 'result' }) + '\n');
    currentFakeProc.emit('close', 0);
    await expect(promise).resolves.toBeUndefined();
  });

  test('executePromptStreaming rejects with INTERRUPTED_MESSAGE when interrupted', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    strategy.interruptAgent();
    currentFakeProc.emit('close', null);
    await expect(promise).rejects.toThrow('INTERRUPTED');
  });

  test('executePromptStreaming rejects on process error', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('error', new Error('spawn failed'));
    await expect(promise).rejects.toThrow('spawn failed');
  });

  test('executePromptStreaming rejects on non-zero exit code', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.stderr.emit('data', 'Critical error');
    currentFakeProc.emit('close', 1);
    await expect(promise).rejects.toThrow('Critical error');
  });

  test('executePromptStreaming sends stderr to onReasoningChunk', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const reasoningChunks: string[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: (c: string) => reasoningChunks.push(c),
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stderr.emit('data', '\u001b[31mcolored stderr\u001b[0m');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(reasoningChunks.some((c) => c.includes('colored stderr'))).toBe(true);
  });

  test('executePromptStreaming creates session marker with conversationDataDir', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const convDir = join(OPENCODE_SPAWN_TEST_HOME, 'opencode-conv');
    const strategy = new OpencodeStrategy({ getConversationDataDir: () => convDir });
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('close', 0);
    await promise;
    expect(existsSync(join(convDir, 'opencode_workspace', '.opencode_session'))).toBe(true);
  });

  test('executePromptStreaming with conversationDataDir reads existing session for --continue', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const convDir = join(OPENCODE_SPAWN_TEST_HOME, 'opencode-conv-resume');
    const workspaceDir = join(convDir, 'opencode_workspace');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, '.opencode_session'), '');

    let capturedArgs: string[] = [];
    mock.module('node:child_process', () => ({
      spawn: (_cmd: string, args: string[]) => { capturedArgs = args; return currentFakeProc; },
      execSync: () => '',
    }));
    const { OpencodeStrategy: OCS2 } = await import('./opencode.strategy');
    const strategy = new OCS2({ getConversationDataDir: () => convDir });
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('close', 0);
    await promise;
    expect(capturedArgs).toContain('--continue');
  });

  test('executePromptStreaming flushes remaining buffer as text event on close', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const chunks: string[] = [];
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c));
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'text', part: { text: 'buffered-text' } })); // no newline
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks).toContain('buffered-text');
  });

  test('executePromptStreaming flushes remaining buffer as raw text when invalid JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const chunks: string[] = [];
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c));
    currentFakeProc.stdout.emit('data', 'raw-buffer-text'); // no newline
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks).toContain('raw-buffer-text');
  });

  test('executePromptStreaming calls onReasoningEnd on close', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    let reasoningEnded = false;
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => { reasoningEnded = true; },
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.emit('close', 0);
    await promise;
    expect(reasoningEnded).toBe(true);
  });

  test('executePromptStreaming with stored key sets OPENAI_API_BASE', async () => {
    // No env keys — stored key only
    const strategy = new OpencodeStrategy();
    const noop = () => undefined;
    strategy.executeAuth({
      sendAuthManualToken: noop,
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    } as never);
    strategy.submitAuthCode('stored-key');

    let capturedEnv: Record<string, string | undefined> = {};
    mock.module('node:child_process', () => ({
      spawn: (_cmd: string, _args: string[], opts: { env: Record<string, string> }) => {
        capturedEnv = opts.env;
        return currentFakeProc;
      },
      execSync: () => '',
    }));
    const { OpencodeStrategy: OCS3 } = await import('./opencode.strategy');
    // Need to reinstantiate with stored key - get the submitAuthCode to work
    const strategy2 = new OCS3();
    strategy2.executeAuth({
      sendAuthManualToken: noop,
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    } as never);
    strategy2.submitAuthCode('stored-key');
    const promise = strategy2.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('close', 0);
    await promise;
    expect(capturedEnv['OPENAI_API_BASE']).toBe('https://openrouter.ai/api/v1');
  });

  test('executePromptStreaming with systemPrompt prepends to prompt', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let capturedArgs: string[] = [];
    mock.module('node:child_process', () => ({
      spawn: (_cmd: string, args: string[]) => { capturedArgs = args; return currentFakeProc; },
      execSync: () => '',
    }));
    const { OpencodeStrategy: OCS4 } = await import('./opencode.strategy');
    const strategy = new OCS4();
    const promise = strategy.executePromptStreaming('user-prompt', 'model', () => undefined, undefined, 'system-prompt');
    currentFakeProc.emit('close', 0);
    await promise;
    const promptArg = capturedArgs[capturedArgs.length - 1];
    expect(promptArg).toContain('system-prompt');
    expect(promptArg).toContain('user-prompt');
  });

  test('listModels times out and returns empty array when process does not close', async () => {
    // Override the timeout constant via TypeScript cast to test the timeout path
    const origTimeout = (OpencodeStrategy as unknown as { LIST_MODELS_TIMEOUT_MS: number }).LIST_MODELS_TIMEOUT_MS;
    Object.defineProperty(OpencodeStrategy, 'LIST_MODELS_TIMEOUT_MS', { value: 1, writable: true, configurable: true });
    try {
      const strategy = new OpencodeStrategy();
      const promise = strategy.listModels();
      // Don't emit close — let the timeout fire naturally (1ms)
      const models = await promise;
      expect(models).toEqual([]);
    } finally {
      Object.defineProperty(OpencodeStrategy, 'LIST_MODELS_TIMEOUT_MS', { value: origTimeout, writable: true, configurable: true });
    }
  });
});

