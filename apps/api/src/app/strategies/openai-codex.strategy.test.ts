import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  handleCodexExecJsonLine,
  OpenaiCodexStrategy,
  type CodexExecJsonState,
  type CodexExecJsonHandlers,
} from './openai-codex.strategy';

import type { ToolEvent } from './strategy.types';

const TEST_HOME = join(tmpdir(), `codex-test-home-${process.pid}`);

/* ---------- helpers ---------- */

function mkEvent(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

function freshState(): CodexExecJsonState {
  return { errorResult: '', inReasoning: false };
}

interface Spy {
  chunks: string[];
  reasoning: string[];
  reasoningStartCount: number;
  reasoningEndCount: number;
  tools: ToolEvent[];
  usage: { inputTokens: number; outputTokens: number } | undefined;
  handlers: CodexExecJsonHandlers;
}

function createSpy(): Spy {
  const spy: Spy = {
    chunks: [],
    reasoning: [],
    reasoningStartCount: 0,
    reasoningEndCount: 0,
    tools: [],
    usage: undefined,
    handlers: {} as CodexExecJsonHandlers,
  };
  spy.handlers = {
    onChunk: (c) => spy.chunks.push(c),
    onReasoningStart: () => spy.reasoningStartCount++,
    onReasoningChunk: (t) => spy.reasoning.push(t),
    onReasoningEnd: () => spy.reasoningEndCount++,
    onTool: (e) => spy.tools.push(e),
    onUsage: (u) => { spy.usage = u; },
  };
  return spy;
}

/* ================================================ */
/*           handleCodexExecJsonLine tests           */
/* ================================================ */

describe('handleCodexExecJsonLine', () => {
  test('ignores empty and whitespace-only lines', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine('', state, spy.handlers);
    handleCodexExecJsonLine('   ', state, spy.handlers);
    handleCodexExecJsonLine('\n', state, spy.handlers);
    expect(spy.chunks).toEqual([]);
    expect(spy.reasoning).toEqual([]);
  });

  test('turn.started opens reasoning', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(mkEvent({ type: 'turn.started' }), state, spy.handlers);
    expect(spy.reasoningStartCount).toBe(1);
    expect(state.inReasoning).toBe(true);
  });

  test('turn.started is idempotent when already in reasoning', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(mkEvent({ type: 'turn.started' }), state, spy.handlers);
    handleCodexExecJsonLine(mkEvent({ type: 'turn.started' }), state, spy.handlers);
    expect(spy.reasoningStartCount).toBe(1);
  });

  test('agent_message emits preview to reasoning, ends reasoning, then emits chunk', () => {
    const state = freshState();
    state.inReasoning = true;
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'agent_message', text: 'Hello world' } }),
      state,
      spy.handlers
    );
    expect(spy.reasoning).toEqual(['Hello world']);
    expect(spy.reasoningEndCount).toBe(1);
    expect(spy.chunks).toEqual(['Hello world']);
    expect(state.inReasoning).toBe(false);
  });

  test('agent_message with long text truncates preview at 200 chars', () => {
    const state = freshState();
    state.inReasoning = true;
    const spy = createSpy();
    const longText = 'a'.repeat(300);
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'agent_message', text: longText } }),
      state,
      spy.handlers
    );
    expect(spy.reasoning[0]).toBe('a'.repeat(200) + '…');
    expect(spy.chunks[0]).toBe(longText); // Full text goes to chunk
  });

  test('agent_message with empty text is a no-op', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'agent_message', text: '' } }),
      state,
      spy.handlers
    );
    expect(spy.chunks).toEqual([]);
    expect(spy.reasoning).toEqual([]);
  });

  test('"message" type is treated the same as agent_message', () => {
    const state = freshState();
    state.inReasoning = true;
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'message', text: 'test' } }),
      state,
      spy.handlers
    );
    expect(spy.chunks).toEqual(['test']);
    expect(spy.reasoningEndCount).toBe(1);
  });

  test('reasoning item opens reasoning and emits text', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'reasoning', text: 'thinking hard' } }),
      state,
      spy.handlers
    );
    expect(spy.reasoningStartCount).toBe(1);
    expect(spy.reasoning).toEqual(['thinking hard']);
    expect(state.inReasoning).toBe(true);
  });

  test('reasoning item without text still starts reasoning', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'reasoning' } }),
      state,
      spy.handlers
    );
    expect(spy.reasoningStartCount).toBe(1);
    expect(spy.reasoning).toEqual([]);
  });

  test('full turn flow: started → reasoning → agent_message → completed', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(mkEvent({ type: 'turn.started' }), state, spy.handlers);
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'reasoning', text: 'thinking' } }),
      state,
      spy.handlers
    );
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }),
      state,
      spy.handlers
    );
    handleCodexExecJsonLine(
      mkEvent({ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 50 } }),
      state,
      spy.handlers
    );

    expect(spy.reasoningStartCount).toBe(1);
    expect(spy.reasoning).toEqual(['thinking', 'done']);
    expect(spy.reasoningEndCount).toBe(1);
    expect(spy.chunks).toEqual(['done']);
    expect(spy.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(state.inReasoning).toBe(false);
  });

  test('command_execution emits tool event and reasoning chunk', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({
        type: 'item.completed',
        item: {
          type: 'command_execution',
          command: 'npm test',
          aggregated_output: 'tests passed',
          exit_code: 0,
        },
      }),
      state,
      spy.handlers
    );
    expect(spy.tools).toEqual([{
      kind: 'tool_call',
      name: 'command',
      command: 'npm test',
      summary: 'tests passed',
    }]);
    expect(spy.reasoning).toEqual(['$ npm test\n']);
  });

  test('command_execution without command is a no-op', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'command_execution' } }),
      state,
      spy.handlers
    );
    expect(spy.tools).toEqual([]);
  });

  test('command_execution truncates aggregated_output to 200 chars', () => {
    const state = freshState();
    const spy = createSpy();
    const longOutput = 'x'.repeat(300);
    handleCodexExecJsonLine(
      mkEvent({
        type: 'item.completed',
        item: { type: 'command_execution', command: 'ls', aggregated_output: longOutput },
      }),
      state,
      spy.handlers
    );
    expect(spy.tools[0].summary).toBe('x'.repeat(200));
  });

  test('file_change emits tool events for each change', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({
        type: 'item.completed',
        item: {
          type: 'file_change',
          changes: [
            { path: 'src/a.ts', kind: 'add' },
            { path: 'src/b.ts', kind: 'modify' },
          ],
        },
      }),
      state,
      spy.handlers
    );
    expect(spy.tools).toEqual([
      { kind: 'file_created', name: 'a.ts', path: 'src/a.ts', summary: 'add' },
      { kind: 'file_created', name: 'b.ts', path: 'src/b.ts', summary: 'modify' },
    ]);
    expect(spy.reasoning).toEqual(['add: src/a.ts\n', 'modify: src/b.ts\n']);
  });

  test('file_change skips entries without path', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({
        type: 'item.completed',
        item: { type: 'file_change', changes: [{ kind: 'add' }] },
      }),
      state,
      spy.handlers
    );
    expect(spy.tools).toEqual([]);
  });

  test('file_change with empty changes array is a no-op', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'file_change', changes: [] } }),
      state,
      spy.handlers
    );
    expect(spy.tools).toEqual([]);
  });

  test('local_shell_call emits tool event', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({
        type: 'item.completed',
        item: { type: 'local_shell_call', name: 'bash', command: 'echo hi', summary: 'greeting' },
      }),
      state,
      spy.handlers
    );
    expect(spy.tools).toEqual([{
      kind: 'tool_call',
      name: 'bash',
      command: 'echo hi',
      path: undefined,
      summary: 'greeting',
    }]);
  });

  test('turn.completed without usage does not call onUsage', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(mkEvent({ type: 'turn.completed' }), state, spy.handlers);
    expect(spy.usage).toBeUndefined();
  });

  test('turn.completed ends reasoning if active', () => {
    const state = freshState();
    state.inReasoning = true;
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }),
      state,
      spy.handlers
    );
    expect(spy.reasoningEndCount).toBe(1);
    expect(state.inReasoning).toBe(false);
    expect(spy.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  test('turn.failed emits error chunk and ends reasoning', () => {
    const state = freshState();
    state.inReasoning = true;
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'turn.failed', error: { message: 'rate limited' } }),
      state,
      spy.handlers
    );
    expect(spy.chunks).toEqual(['⚠️ rate limited']);
    expect(state.errorResult).toBe('rate limited');
    expect(spy.reasoningEndCount).toBe(1);
  });

  test('turn.failed without error message uses default', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(mkEvent({ type: 'turn.failed' }), state, spy.handlers);
    expect(spy.chunks).toEqual(['⚠️ Turn failed']);
  });

  test('error event with top-level message', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'error', message: 'boom' }),
      state,
      spy.handlers
    );
    expect(spy.chunks).toEqual(['⚠️ boom']);
    expect(state.errorResult).toBe('boom');
  });

  test('error event with nested error.message', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'error', error: { message: 'nested boom' } }),
      state,
      spy.handlers
    );
    expect(spy.chunks).toEqual(['⚠️ nested boom']);
  });

  test('error event without any message uses default', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(mkEvent({ type: 'error' }), state, spy.handlers);
    expect(spy.chunks).toEqual(['⚠️ Unknown codex error']);
  });

  test('non-JSON line is passed through with ANSI stripped', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine('\u001b[31mplain text\u001b[0m', state, spy.handlers);
    expect(spy.chunks).toEqual(['plain text']);
  });

  test('non-JSON whitespace-only content after ANSI strip is ignored', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine('\u001b[31m\u001b[0m', state, spy.handlers);
    expect(spy.chunks).toEqual([]);
  });

  test('thread.started is silently ignored', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'thread.started', thread_id: 'abc' }),
      state,
      spy.handlers
    );
    expect(spy.chunks).toEqual([]);
    expect(spy.reasoning).toEqual([]);
    expect(spy.reasoningStartCount).toBe(0);
  });

  test('unknown item type is silently ignored', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'unknown_future_type' } }),
      state,
      spy.handlers
    );
    expect(spy.chunks).toEqual([]);
    expect(spy.tools).toEqual([]);
  });

  test('handlers without optional callbacks still work', () => {
    const state = freshState();
    const chunks: string[] = [];
    const minimalHandlers: CodexExecJsonHandlers = {
      onChunk: (c) => chunks.push(c),
    };
    // These should not throw even without optional handlers
    handleCodexExecJsonLine(mkEvent({ type: 'turn.started' }), state, minimalHandlers);
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'agent_message', text: 'hi' } }),
      state,
      minimalHandlers
    );
    handleCodexExecJsonLine(
      mkEvent({ type: 'item.completed', item: { type: 'command_execution', command: 'ls' } }),
      state,
      minimalHandlers
    );
    handleCodexExecJsonLine(
      mkEvent({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }),
      state,
      minimalHandlers
    );
    expect(chunks).toEqual(['hi']);
  });

  test('errorResult accumulates across multiple error events', () => {
    const state = freshState();
    const spy = createSpy();
    handleCodexExecJsonLine(mkEvent({ type: 'error', message: 'first' }), state, spy.handlers);
    handleCodexExecJsonLine(mkEvent({ type: 'error', message: ' second' }), state, spy.handlers);
    expect(state.errorResult).toBe('first second');
  });
});

/* ================================================ */
/*           OpenaiCodexStrategy tests               */
/* ================================================ */

describe('OpenaiCodexStrategy', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.HOME = process.env.HOME;
    savedEnv.SESSION_DIR = process.env.SESSION_DIR;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    process.env.HOME = TEST_HOME;
    process.env.SESSION_DIR = join(TEST_HOME, '.codex');
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = savedEnv.HOME;
    if (savedEnv.SESSION_DIR === undefined) delete process.env.SESSION_DIR;
    else process.env.SESSION_DIR = savedEnv.SESSION_DIR;
    if (savedEnv.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  test('ensureSettings creates Codex home directory when missing', () => {
    const codexDir = join(TEST_HOME, '.codex');
    expect(existsSync(codexDir)).toBe(false);
    const strategy = new OpenaiCodexStrategy();
    strategy.ensureSettings();
    expect(existsSync(codexDir)).toBe(true);
  });

  test('ensureSettings leaves directory unchanged when it exists', () => {
    const codexDir = join(TEST_HOME, '.codex');
    mkdirSync(codexDir, { recursive: true });
    const strategy = new OpenaiCodexStrategy();
    strategy.ensureSettings();
    expect(existsSync(codexDir)).toBe(true);
  });

  test('checkAuthStatus returns false when auth file does not exist', async () => {
    const strategy = new OpenaiCodexStrategy();
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(false);
  });

  test('checkAuthStatus returns true when auth.json has api_key', async () => {
    const codexDir = join(TEST_HOME, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, 'auth.json'), JSON.stringify({ api_key: 'sk-test' }), {
      mode: 0o600,
    });
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy();
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('checkAuthStatus returns true when auth.json has access_token', async () => {
    const codexDir = join(TEST_HOME, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, 'auth.json'), JSON.stringify({ access_token: 'tok' }), {
      mode: 0o600,
    });
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy();
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('checkAuthStatus returns false when auth.json is invalid JSON', async () => {
    const codexDir = join(TEST_HOME, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, 'auth.json'), 'not json', { mode: 0o600 });
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy();
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(false);
  });

  test('clearCredentials removes auth.json when present', () => {
    const codexDir = join(TEST_HOME, '.codex');
    mkdirSync(codexDir, { recursive: true });
    const authPath = join(codexDir, 'auth.json');
    writeFileSync(authPath, '{}', { mode: 0o600 });
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy();
    strategy.clearCredentials();
    expect(existsSync(authPath)).toBe(false);
  });

  test('clearCredentials is no-op when auth file does not exist', () => {
    process.env.SESSION_DIR = join(TEST_HOME, '.codex');
    const strategy = new OpenaiCodexStrategy();
    expect(() => strategy.clearCredentials()).not.toThrow();
  });

  test('checkAuthStatus returns true in api-token mode when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-token';
    const strategy = new OpenaiCodexStrategy(true);
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('checkAuthStatus returns false in api-token mode when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY;
    const strategy = new OpenaiCodexStrategy(true);
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(false);
  });

  test('ensureSettings in api-token mode writes auth.json when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-env-key';
    const codexDir = join(TEST_HOME, '.codex');
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy(true);
    strategy.ensureSettings();
    expect(existsSync(join(codexDir, 'auth.json'))).toBe(true);
    const content = readFileSync(join(codexDir, 'auth.json'), 'utf8');
    expect(JSON.parse(content)).toEqual({ api_key: 'sk-env-key' });
  });

  test('ensureSettings in api-token mode does not write auth.json when OPENAI_API_KEY is empty', () => {
    delete process.env.OPENAI_API_KEY;
    const codexDir = join(TEST_HOME, '.codex');
    process.env.SESSION_DIR = codexDir;
    mkdirSync(codexDir, { recursive: true });
    const strategy = new OpenaiCodexStrategy(true);
    strategy.ensureSettings();
    expect(existsSync(join(codexDir, 'auth.json'))).toBe(false);
  });

  test('executeAuth in api-token mode sends authSuccess when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-ok';
    const strategy = new OpenaiCodexStrategy(true);
    let successCalled = false;
    const noop = () => { return; };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: () => { successCalled = true; },
      sendAuthStatus: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection);
    expect(successCalled).toBe(true);
  });

  test('cancelAuth clears state safely', () => {
    const strategy = new OpenaiCodexStrategy();
    strategy.cancelAuth();
  });

  test('submitAuthCode does nothing when code is empty', () => {
    const strategy = new OpenaiCodexStrategy();
    strategy.submitAuthCode('');
  });

  test('interruptAgent does not throw', () => {
    const strategy = new OpenaiCodexStrategy();
    strategy.interruptAgent();
  });

  test('constructor with conversationDataDir', () => {
    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => join(TEST_HOME, 'conv-data'),
      getEncryptionKey: () => undefined,
    });
    expect(strategy).toBeDefined();
  });

  test('getWorkingDir returns codex_workspace relative to cwd by default', () => {
    const strategy = new OpenaiCodexStrategy();
    const dir = strategy.getWorkingDir();
    expect(dir).toContain('codex_workspace');
  });

  test('getWorkingDir returns codex_workspace under conversationDataDir', () => {
    const convDir = join(TEST_HOME, 'conv-data');
    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });
    expect(strategy.getWorkingDir()).toBe(join(convDir, 'codex_workspace'));
  });
});
