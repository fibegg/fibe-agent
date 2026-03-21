/**
 * Spawn-based tests for ClaudeCodeStrategy.
 * Uses Bun's mock.module() + dynamic import pattern to intercept spawn.
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLAUDE_SPAWN_TEST_HOME = join(tmpdir(), `claude-spawn-test-${process.pid}`);

function makeFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: () => void; write: (s: string) => void };
    kill: () => void;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { end: () => undefined, write: () => undefined };
  proc.kill = () => undefined;
  return proc;
}

let currentFakeProc = makeFakeProcess();

mock.module('node:child_process', () => ({
  spawn: (_cmd: string, _args: string[], _opts?: Record<string, unknown>) => currentFakeProc,
  execSync: () => '',
}));

// Dynamic imports AFTER mocking
const { ClaudeCodeStrategy } = await import('./claude-code.strategy');

describe('ClaudeCodeStrategy spawn-mocked paths', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const SAVED_KEYS = ['HOME', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'] as const;

  beforeEach(() => {
    currentFakeProc = makeFakeProcess();
    for (const k of SAVED_KEYS) savedEnv[k] = process.env[k];
    process.env.HOME = CLAUDE_SPAWN_TEST_HOME;
    for (const k of SAVED_KEYS.slice(1)) delete process.env[k];
    if (!existsSync(CLAUDE_SPAWN_TEST_HOME)) mkdirSync(CLAUDE_SPAWN_TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    for (const k of SAVED_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    if (existsSync(CLAUDE_SPAWN_TEST_HOME)) rmSync(CLAUDE_SPAWN_TEST_HOME, { recursive: true, force: true });
  });

  // ─── executeLogout ─────────────────────────────────────────

  test('executeLogout calls sendLogoutSuccess on process close', (done) => {
    const strategy = new ClaudeCodeStrategy();
    strategy.executeLogout({
      sendLogoutOutput: () => undefined,
      sendLogoutSuccess: () => done(),
      sendError: () => undefined,
    });
    currentFakeProc.emit('close');
  });

  test('executeLogout relays stdout and stderr to sendLogoutOutput', (done) => {
    const strategy = new ClaudeCodeStrategy();
    const outputs: string[] = [];
    strategy.executeLogout({
      sendLogoutOutput: (text) => outputs.push(text),
      sendLogoutSuccess: () => {
        expect(outputs).toContain('out-data');
        expect(outputs).toContain('err-data');
        done();
      },
      sendError: () => undefined,
    });
    currentFakeProc.stdout.emit('data', Buffer.from('out-data'));
    currentFakeProc.stderr.emit('data', 'err-data');
    currentFakeProc.emit('close');
  });

  test('executeLogout calls sendLogoutSuccess on process error', (done) => {
    const strategy = new ClaudeCodeStrategy();
    strategy.executeLogout({
      sendLogoutOutput: () => undefined,
      sendLogoutSuccess: () => done(),
      sendError: () => undefined,
    });
    currentFakeProc.emit('error', new Error('spawn error'));
  });

  // ─── checkAuthStatus non-api-token (spawn path) ────────────

  test('checkAuthStatus returns false when no token file in non-api-token mode', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(false);
  });

  test('checkAuthStatus non-api-token returns true when loggedIn=true in JSON', (done) => {
    const claudeDir = join(CLAUDE_SPAWN_TEST_HOME, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'agent_token.txt'), 'fake-token');

    const strategy = new ClaudeCodeStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(true);
      done();
    });
    currentFakeProc.stdout.emit('data', JSON.stringify({ loggedIn: true }));
    currentFakeProc.emit('close', 0);
  });

  test('checkAuthStatus non-api-token returns false when loggedIn=false', (done) => {
    const claudeDir = join(CLAUDE_SPAWN_TEST_HOME, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'agent_token.txt'), 'fake-token');

    const strategy = new ClaudeCodeStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(false);
      done();
    });
    currentFakeProc.stdout.emit('data', JSON.stringify({ loggedIn: false }));
    currentFakeProc.emit('close', 0);
  });

  test('checkAuthStatus non-api-token returns false on non-zero exit', (done) => {
    const claudeDir = join(CLAUDE_SPAWN_TEST_HOME, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'agent_token.txt'), 'fake-token');

    const strategy = new ClaudeCodeStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(false);
      done();
    });
    currentFakeProc.emit('close', 1);
  });

  test('checkAuthStatus non-api-token returns false on malformed JSON', (done) => {
    const claudeDir = join(CLAUDE_SPAWN_TEST_HOME, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'agent_token.txt'), 'fake-token');

    const strategy = new ClaudeCodeStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(false);
      done();
    });
    currentFakeProc.stdout.emit('data', 'not-json');
    currentFakeProc.emit('close', 0);
  });

  test('checkAuthStatus non-api-token returns false on spawn error', (done) => {
    const claudeDir = join(CLAUDE_SPAWN_TEST_HOME, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'agent_token.txt'), 'fake-token');

    const strategy = new ClaudeCodeStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(false);
      done();
    });
    currentFakeProc.emit('error', new Error('spawn failed'));
  });

  // ─── executePromptStreaming ─────────────────────────────────

  test('executePromptStreaming resolves with plain text output', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const chunks: string[] = [];
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c));
    currentFakeProc.stdout.emit('data', 'Hello World!');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks).toContain('Hello World!');
  });

  test('executePromptStreaming rejects on non-zero exit with stderr', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.stderr.emit('data', 'Error details');
    currentFakeProc.emit('close', 1);
    await expect(promise).rejects.toThrow('Error details');
  });

  test('executePromptStreaming rejects on process error event', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('error', new Error('spawn failed'));
    await expect(promise).rejects.toThrow('spawn failed');
  });

  test('executePromptStreaming rejects with INTERRUPTED_MESSAGE when interrupted', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    strategy.interruptAgent();
    currentFakeProc.emit('close', null);
    await expect(promise).rejects.toThrow('INTERRUPTED');
  });

  test('executePromptStreaming with stream-json fires onChunk for text_delta', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const chunks: string[] = [];
    const callbacks = {
      onChunk: (c: string) => chunks.push(c),
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c), callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'streamed text' } },
    }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks).toContain('streamed text');
  });

  test('executePromptStreaming with stream-json fires onReasoningChunk for thinking_delta', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const reasoningChunks: string[] = [];
    let reasoningStarted = false;
    let reasoningEnded = false;
    const callbacks = {
      onReasoningStart: () => { reasoningStarted = true; },
      onReasoningEnd: () => { reasoningEnded = true; },
      onReasoningChunk: (c: string) => reasoningChunks.push(c),
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'thinking stuff' } },
    }) + '\n');
    currentFakeProc.stdout.emit('data', JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_stop' },
    }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(reasoningStarted).toBe(true);
    expect(reasoningEnded).toBe(true);
    expect(reasoningChunks).toContain('thinking stuff');
  });

  test('executePromptStreaming fires onTool for content_block_start tool_use', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const toolEvents: unknown[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: (e: unknown) => toolEvents.push(e),
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'write_file', input: { path: 'foo.ts' } } },
    }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(toolEvents.length).toBeGreaterThan(0);
  });

  test('executePromptStreaming tracks usage via message_start top-level', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const usages: unknown[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: (u: unknown) => usages.push(u),
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 20 } } }) + '\n');
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'message_stop' }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(usages.length).toBeGreaterThan(0);
  });

  test('executePromptStreaming tracks usage via stream_event message_start', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const usages: unknown[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: (u: unknown) => usages.push(u),
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'stream_event', event: { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 15 } } } }) + '\n');
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'stream_event', event: { type: 'message_stop' } }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(usages.length).toBeGreaterThan(0);
  });

  test('executePromptStreaming tracks usage via stream_event message_delta', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const usages: unknown[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: (u: unknown) => usages.push(u),
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'stream_event', event: { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 10 } } } }) + '\n');
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 20 } } }) + '\n');
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'stream_event', event: { type: 'message_stop' } }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(usages.length).toBeGreaterThan(0);
  });

  test('executePromptStreaming tracks usage via message_delta top-level', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const usages: unknown[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: (u: unknown) => usages.push(u),
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 10 } } }) + '\n');
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'message_delta', usage: { input_tokens: 5, output_tokens: 15 } }) + '\n');
    currentFakeProc.stdout.emit('data', JSON.stringify({ type: 'message_stop' }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(usages.length).toBeGreaterThan(0);
  });

  test('executePromptStreaming flushes remaining buffer on close', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const chunks: string[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c), callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'flushed' } },
    })); // no trailing newline
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks).toContain('flushed');
  });

  test('executePromptStreaming ignores malformed JSON lines without throwing', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', 'not-json\n');
    currentFakeProc.emit('close', 0);
    await expect(promise).resolves.toBeUndefined();
  });

  test('executePromptStreaming with conversationDataDir creates session marker on success', async () => {
    const convDir = join(CLAUDE_SPAWN_TEST_HOME, 'conv-session');
    const strategy = new ClaudeCodeStrategy(false, { getConversationDataDir: () => convDir });
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.stdout.emit('data', 'output');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(existsSync(join(convDir, 'claude_workspace', '.claude_session'))).toBe(true);
  });

  test('executePromptStreaming with conversationDataDir reads existing session for --continue', async () => {
    const convDir = join(CLAUDE_SPAWN_TEST_HOME, 'conv-session-existing');
    const workspaceDir = join(convDir, 'claude_workspace');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, '.claude_session'), '');
    let spawnCmd = '';
    let spawnArgs: string[] = [];
    mock.module('node:child_process', () => ({
      spawn: (cmd: string, args: string[]) => {
        spawnCmd = cmd;
        spawnArgs = args;
        return currentFakeProc;
      },
      execSync: () => '',
    }));
    const { ClaudeCodeStrategy: CCS2 } = await import('./claude-code.strategy');
    const strategy = new CCS2(false, { getConversationDataDir: () => convDir });
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('close', 0);
    await promise;
    expect(spawnArgs).toContain('--continue');
    expect(spawnCmd).toBeDefined();
  });

  test('executePromptStreaming with systemPrompt includes --system-prompt flag', async () => {
    let capturedArgs: string[] = [];
    mock.module('node:child_process', () => ({
      spawn: (_cmd: string, args: string[]) => { capturedArgs = args; return currentFakeProc; },
      execSync: () => '',
    }));
    const { ClaudeCodeStrategy: CCS3 } = await import('./claude-code.strategy');
    const strategy = new CCS3(false);
    const promise = strategy.executePromptStreaming('prompt', 'model', () => undefined, undefined, 'sys-prompt');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(capturedArgs).toContain('--system-prompt');
    expect(capturedArgs).toContain('sys-prompt');
  });

  test('executePromptStreaming thinking_delta uses text field as fallback', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const reasoningChunks: string[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: (c: string) => reasoningChunks.push(c),
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', text: 'fallback-thinking' } },
    }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(reasoningChunks).toContain('fallback-thinking');
  });

  test('executePromptStreaming text_delta after thinking calls onReasoningEnd', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    let reasoningEnded = false;
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => { reasoningEnded = true; },
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stdout.emit('data', JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'thinking...' } },
    }) + '\n');
    currentFakeProc.stdout.emit('data', JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'answer' } },
    }) + '\n');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(reasoningEnded).toBe(true);
  });

  // ─── getPlaygroundDirs edge cases ──────────────────────────

  test('getPlaygroundDirs returns empty array when playground dir does not exist', async () => {
    const strategy = new ClaudeCodeStrategy(false);
    const promise = strategy.executePromptStreaming('prompt', 'model', () => undefined);
    currentFakeProc.emit('close', 0);
    await promise; // Should NOT throw even if playground dir is missing
  });

  test('getPlaygroundDirs includes subdirectories when playground dir exists', async () => {
    let capturedArgs: string[] = [];
    const playgroundDir = join(process.cwd(), 'playground');
    const subDir = join(playgroundDir, 'test-getting-dirs');
    try {
      if (!existsSync(playgroundDir)) mkdirSync(playgroundDir, { recursive: true });
      if (!existsSync(subDir)) mkdirSync(subDir, { recursive: true });

      mock.module('node:child_process', () => ({
        spawn: (_cmd: string, args: string[]) => { capturedArgs = args; return currentFakeProc; },
        execSync: () => '',
      }));
      const { ClaudeCodeStrategy: CCS4 } = await import('./claude-code.strategy');
      const strategy = new CCS4(false);
      const promise = strategy.executePromptStreaming('prompt', 'model', () => undefined);
      currentFakeProc.emit('close', 0);
      await promise;
      expect(capturedArgs).toContain('--add-dir');
    } finally {
      try { rmSync(subDir, { force: true, recursive: true }); } catch { /* ignore */ }
    }
  });

  // ─── checkAuthStatus timeout path (lines 226-227) ──────────

  test('checkAuthStatus kills process and returns false on AUTH_STATUS_TIMEOUT_MS timeout', async () => {
    const claudeDir = join(CLAUDE_SPAWN_TEST_HOME, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'agent_token.txt'), 'fake-token');

    // Override timeout to 1ms so we don't wait 10 seconds
    Object.defineProperty(ClaudeCodeStrategy, 'AUTH_STATUS_TIMEOUT_MS', { value: 1, writable: true, configurable: true });
    try {
      const strategy = new ClaudeCodeStrategy(false);
      // Don't emit any events — let the 1ms timeout fire
      const result = await strategy.checkAuthStatus();
      expect(result).toBe(false);
    } finally {
      Object.defineProperty(ClaudeCodeStrategy, 'AUTH_STATUS_TIMEOUT_MS', { value: undefined, writable: true, configurable: true });
    }
  });
});

