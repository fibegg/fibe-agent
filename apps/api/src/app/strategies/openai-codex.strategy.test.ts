import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  return { errorResult: '', inReasoning: false, hasEmittedOutput: false };
}

interface Spy {
  chunks: string[];
  reasoning: string[];
  reasoningStartCount: number;
  reasoningEndCount: number;
  tools: ToolEvent[];
  threadIds: string[];
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
    threadIds: [],
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
    onThreadId: (threadId) => spy.threadIds.push(threadId),
  };
  return spy;
}

function writeFakeCodex(path: string): void {
  writeFileSync(path, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.CODEX_FAKE_ARGS_PATH) {
  fs.writeFileSync(process.env.CODEX_FAKE_ARGS_PATH, JSON.stringify(args));
}
if (process.env.CODEX_FAKE_CWD_PATH) {
  fs.writeFileSync(process.env.CODEX_FAKE_CWD_PATH, process.cwd());
}
if (process.env.CODEX_FAKE_ENV_PATH) {
  fs.writeFileSync(process.env.CODEX_FAKE_ENV_PATH, JSON.stringify({
    CODEX_HOME: process.env.CODEX_HOME,
  }));
}
if (process.env.CODEX_FAKE_MODE === 'error') {
  console.error('fake codex failed');
  process.exit(7);
}
if (process.env.CODEX_FAKE_MODE === 'missing-session') {
  console.error('No conversation found with session ID: ' + (process.env.CODEX_FAKE_THREAD_ID || 'stale-thread-id'));
  process.exit(7);
}
if (process.env.CODEX_FAKE_MODE === 'empty') {
  console.log(JSON.stringify({ type: 'thread.started', thread_id: 'thread-empty' }));
  process.exit(0);
}
if (process.env.CODEX_FAKE_EMIT_THREAD !== 'false') {
  console.log(JSON.stringify({ type: 'thread.started', thread_id: process.env.CODEX_FAKE_THREAD_ID || 'thread-123' }));
}
console.log(JSON.stringify({ type: 'turn.started' }));
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: process.env.CODEX_FAKE_MESSAGE || 'fake response' } }));
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 2 } }));
`, { mode: 0o755 });
  chmodSync(path, 0o755);
}

function writeFakeCodexAppServer(path: string): void {
  writeFileSync(path, `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');

const requestsPath = process.env.CODEX_FAKE_REQUESTS_PATH;
const threadId = process.env.CODEX_FAKE_THREAD_ID || 'thread-app';
const turnId = process.env.CODEX_FAKE_TURN_ID || 'turn-app';
const delay = Number(process.env.CODEX_FAKE_TURN_DELAY_MS || '0');
const message = process.env.CODEX_FAKE_MESSAGE || 'app response';

function record(message) {
  if (requestsPath) fs.appendFileSync(requestsPath, JSON.stringify(message) + '\\n');
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ id, result }) + '\\n');
}

function notify(method, params) {
  process.stdout.write(JSON.stringify({ method, params }) + '\\n');
}

function completeTurn(activeThreadId) {
  notify('thread/tokenUsage/updated', {
    threadId: activeThreadId,
    turnId,
    tokenUsage: { last: { inputTokens: 3, outputTokens: 4 } },
  });
  notify('turn/completed', {
    threadId: activeThreadId,
    turn: { id: turnId, items: [], status: 'completed', error: null },
  });
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  record(msg);

  if (msg.method === 'initialize') {
    respond(msg.id, {
      userAgent: 'fake-codex-app-server',
      codexHome: process.env.CODEX_HOME || '',
      platformFamily: 'unix',
      platformOs: 'linux',
    });
    return;
  }

  if (msg.method === 'initialized') return;

  if (msg.method === 'thread/start') {
    respond(msg.id, {
      thread: {
        id: threadId,
        status: { type: 'idle' },
        cwd: msg.params.cwd,
        turns: [],
      },
    });
    notify('thread/started', {
      thread: {
        id: threadId,
        status: { type: 'idle' },
        cwd: msg.params.cwd,
        turns: [],
      },
    });
    return;
  }

  if (msg.method === 'thread/resume') {
    respond(msg.id, {
      thread: {
        id: msg.params.threadId,
        status: { type: 'idle' },
        cwd: msg.params.cwd,
        turns: [],
      },
    });
    return;
  }

  if (msg.method === 'turn/start') {
    respond(msg.id, {
      turn: { id: turnId, items: [], status: 'inProgress', error: null },
    });
    notify('turn/started', {
      threadId: msg.params.threadId,
      turn: { id: turnId, items: [], status: 'inProgress', error: null },
    });
    notify('item/agentMessage/delta', {
      threadId: msg.params.threadId,
      turnId,
      itemId: 'assistant-1',
      delta: message,
    });
    setTimeout(() => completeTurn(msg.params.threadId), delay);
    return;
  }

  if (msg.method === 'turn/steer') {
    respond(msg.id, { turnId });
    return;
  }

  if (msg.method === 'turn/interrupt') {
    respond(msg.id, {});
    process.exit(0);
  }
});
`, { mode: 0o755 });
  chmodSync(path, 0o755);
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function readJsonl(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
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
      details: JSON.stringify({ command: 'npm test', output: 'tests passed' }),
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
      { kind: 'file_created', name: 'a.ts', path: 'src/a.ts', summary: 'add', details: JSON.stringify({ path: 'src/a.ts', kind: 'add' }) },
      { kind: 'file_created', name: 'b.ts', path: 'src/b.ts', summary: 'modify', details: JSON.stringify({ path: 'src/b.ts', kind: 'modify' }) },
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
      details: JSON.stringify({ type: 'local_shell_call', name: 'bash', command: 'echo hi', summary: 'greeting' }),
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

  test('thread.started captures the native Codex thread id without user-visible output', () => {
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
    expect(spy.threadIds).toEqual(['abc']);
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
    savedEnv.CODEX_HOME = process.env.CODEX_HOME;
    savedEnv.CODEX_BIN = process.env.CODEX_BIN;
    savedEnv.CODEX_AGENT_TRANSPORT = process.env.CODEX_AGENT_TRANSPORT;
    savedEnv.CODEX_USE_APP_SERVER = process.env.CODEX_USE_APP_SERVER;
    savedEnv.CODEX_FAKE_ARGS_PATH = process.env.CODEX_FAKE_ARGS_PATH;
    savedEnv.CODEX_FAKE_CWD_PATH = process.env.CODEX_FAKE_CWD_PATH;
    savedEnv.CODEX_FAKE_ENV_PATH = process.env.CODEX_FAKE_ENV_PATH;
    savedEnv.CODEX_FAKE_REQUESTS_PATH = process.env.CODEX_FAKE_REQUESTS_PATH;
    savedEnv.CODEX_FAKE_MODE = process.env.CODEX_FAKE_MODE;
    savedEnv.CODEX_FAKE_THREAD_ID = process.env.CODEX_FAKE_THREAD_ID;
    savedEnv.CODEX_FAKE_TURN_ID = process.env.CODEX_FAKE_TURN_ID;
    savedEnv.CODEX_FAKE_TURN_DELAY_MS = process.env.CODEX_FAKE_TURN_DELAY_MS;
    savedEnv.CODEX_FAKE_EMIT_THREAD = process.env.CODEX_FAKE_EMIT_THREAD;
    savedEnv.CODEX_FAKE_MESSAGE = process.env.CODEX_FAKE_MESSAGE;
    process.env.HOME = TEST_HOME;
    process.env.SESSION_DIR = join(TEST_HOME, '.codex');
    process.env.CODEX_AGENT_TRANSPORT = 'exec';
    delete process.env.CODEX_HOME;
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
    if (savedEnv.CODEX_HOME === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = savedEnv.CODEX_HOME;
    if (savedEnv.CODEX_BIN === undefined) delete process.env.CODEX_BIN;
    else process.env.CODEX_BIN = savedEnv.CODEX_BIN;
    if (savedEnv.CODEX_AGENT_TRANSPORT === undefined) delete process.env.CODEX_AGENT_TRANSPORT;
    else process.env.CODEX_AGENT_TRANSPORT = savedEnv.CODEX_AGENT_TRANSPORT;
    if (savedEnv.CODEX_USE_APP_SERVER === undefined) delete process.env.CODEX_USE_APP_SERVER;
    else process.env.CODEX_USE_APP_SERVER = savedEnv.CODEX_USE_APP_SERVER;
    if (savedEnv.CODEX_FAKE_ARGS_PATH === undefined) delete process.env.CODEX_FAKE_ARGS_PATH;
    else process.env.CODEX_FAKE_ARGS_PATH = savedEnv.CODEX_FAKE_ARGS_PATH;
    if (savedEnv.CODEX_FAKE_CWD_PATH === undefined) delete process.env.CODEX_FAKE_CWD_PATH;
    else process.env.CODEX_FAKE_CWD_PATH = savedEnv.CODEX_FAKE_CWD_PATH;
    if (savedEnv.CODEX_FAKE_ENV_PATH === undefined) delete process.env.CODEX_FAKE_ENV_PATH;
    else process.env.CODEX_FAKE_ENV_PATH = savedEnv.CODEX_FAKE_ENV_PATH;
    if (savedEnv.CODEX_FAKE_REQUESTS_PATH === undefined) delete process.env.CODEX_FAKE_REQUESTS_PATH;
    else process.env.CODEX_FAKE_REQUESTS_PATH = savedEnv.CODEX_FAKE_REQUESTS_PATH;
    if (savedEnv.CODEX_FAKE_MODE === undefined) delete process.env.CODEX_FAKE_MODE;
    else process.env.CODEX_FAKE_MODE = savedEnv.CODEX_FAKE_MODE;
    if (savedEnv.CODEX_FAKE_THREAD_ID === undefined) delete process.env.CODEX_FAKE_THREAD_ID;
    else process.env.CODEX_FAKE_THREAD_ID = savedEnv.CODEX_FAKE_THREAD_ID;
    if (savedEnv.CODEX_FAKE_TURN_ID === undefined) delete process.env.CODEX_FAKE_TURN_ID;
    else process.env.CODEX_FAKE_TURN_ID = savedEnv.CODEX_FAKE_TURN_ID;
    if (savedEnv.CODEX_FAKE_TURN_DELAY_MS === undefined) delete process.env.CODEX_FAKE_TURN_DELAY_MS;
    else process.env.CODEX_FAKE_TURN_DELAY_MS = savedEnv.CODEX_FAKE_TURN_DELAY_MS;
    if (savedEnv.CODEX_FAKE_EMIT_THREAD === undefined) delete process.env.CODEX_FAKE_EMIT_THREAD;
    else process.env.CODEX_FAKE_EMIT_THREAD = savedEnv.CODEX_FAKE_EMIT_THREAD;
    if (savedEnv.CODEX_FAKE_MESSAGE === undefined) delete process.env.CODEX_FAKE_MESSAGE;
    else process.env.CODEX_FAKE_MESSAGE = savedEnv.CODEX_FAKE_MESSAGE;
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

  test('getModelArgs returns Codex model args only for real model names', () => {
    const strategy = new OpenaiCodexStrategy();
    expect(strategy.getModelArgs('gpt-5.4')).toEqual(['-m', 'gpt-5.4']);
    expect(strategy.getModelArgs('')).toEqual([]);
    expect(strategy.getModelArgs('undefined')).toEqual([]);
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

  test('getWorkingDir uses shared default workspace when provider exposes default data dir', () => {
    const defaultDir = join(TEST_HOME, 'default-data');
    const convDir = join(TEST_HOME, 'conversations', 'conv-a');
    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getDefaultConversationDataDir: () => defaultDir,
      getConversationId: () => 'conv-a',
      getEncryptionKey: () => undefined,
    });
    expect(strategy.getWorkingDir()).toBe(join(defaultDir, 'codex_workspace'));
  });

  test('hasNativeSessionSupport is true only when a Codex session marker exists', () => {
    const convDir = join(TEST_HOME, 'native-support-conv');
    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    expect(strategy.hasNativeSessionSupport()).toBe(false);

    mkdirSync(convDir, { recursive: true });
    writeFileSync(join(convDir, '.codex_session'), 'thread-abc');

    expect(strategy.hasNativeSessionSupport()).toBe(true);
  });

  test('executePromptStreaming starts a new Codex exec run and saves the captured thread id', async () => {
    const fakeCodexPath = join(TEST_HOME, 'fake-codex');
    const argsPath = join(TEST_HOME, 'codex-args.json');
    writeFakeCodex(fakeCodexPath);
    process.env.CODEX_BIN = fakeCodexPath;
    process.env.CODEX_FAKE_ARGS_PATH = argsPath;
    process.env.CODEX_FAKE_THREAD_ID = 'thread-new';

    const convDir = join(TEST_HOME, 'new-session-conv');
    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });
    const chunks: string[] = [];

    await strategy.executePromptStreaming('hello', 'gpt-5.4', (chunk) => chunks.push(chunk));

    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      'exec',
      '-m',
      'gpt-5.4',
      '--color',
      'never',
      '--dangerously-bypass-approvals-and-sandbox',
      '--json',
      '--',
      'hello',
    ]);
    expect(readFileSync(join(convDir, '.codex_session'), 'utf8')).toBe('thread-new');
    expect(chunks).toEqual(['fake response']);
    expect(strategy.hasNativeSessionSupport()).toBe(true);
  });

  test('executePromptStreaming preserves Rails-provided CODEX_HOME', async () => {
    const fakeCodexPath = join(TEST_HOME, 'fake-codex');
    const envPath = join(TEST_HOME, 'codex-env.json');
    writeFakeCodex(fakeCodexPath);
    process.env.CODEX_BIN = fakeCodexPath;
    process.env.CODEX_FAKE_ENV_PATH = envPath;
    process.env.CODEX_HOME = join(TEST_HOME, 'fibe-codex-home');
    process.env.SESSION_DIR = join(TEST_HOME, 'legacy-session-codex');

    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => join(TEST_HOME, 'fibe-codex-conv'),
      getEncryptionKey: () => undefined,
    });

    await strategy.executePromptStreaming('hello', 'gpt-5.4', () => undefined);

    expect(JSON.parse(readFileSync(envPath, 'utf8'))).toEqual({
      CODEX_HOME: join(TEST_HOME, 'fibe-codex-home'),
    });
  });

  test('executePromptStreaming resumes an existing Codex session and keeps marker when no new thread id is emitted', async () => {
    const fakeCodexPath = join(TEST_HOME, 'fake-codex');
    const argsPath = join(TEST_HOME, 'codex-args.json');
    writeFakeCodex(fakeCodexPath);
    process.env.CODEX_BIN = fakeCodexPath;
    process.env.CODEX_FAKE_ARGS_PATH = argsPath;
    process.env.CODEX_FAKE_EMIT_THREAD = 'false';

    const convDir = join(TEST_HOME, 'resume-session-conv');
    mkdirSync(convDir, { recursive: true });
    writeFileSync(join(convDir, '.codex_session'), 'thread-existing');

    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await strategy.executePromptStreaming('continue', 'gpt-5.4', () => undefined);

    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      'exec',
      'resume',
      '-m',
      'gpt-5.4',
      '--color',
      'never',
      '--dangerously-bypass-approvals-and-sandbox',
      '--json',
      'thread-existing',
      '--',
      'continue',
    ]);
    expect(readFileSync(join(convDir, '.codex_session'), 'utf8')).toBe('thread-existing');
  });

  test('executePromptStreaming places `--` before a dash-prefixed prompt so Codex arg parsing does not treat it as a flag', async () => {
    const fakeCodexPath = join(TEST_HOME, 'fake-codex');
    const argsPath = join(TEST_HOME, 'codex-args.json');
    writeFakeCodex(fakeCodexPath);
    process.env.CODEX_BIN = fakeCodexPath;
    process.env.CODEX_FAKE_ARGS_PATH = argsPath;
    process.env.CODEX_FAKE_THREAD_ID = 'thread-dash';

    const convDir = join(TEST_HOME, 'dash-prefix-conv');
    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    const dashPrompt = '- bullet from system prompt\n[SYSCHECK]';
    await strategy.executePromptStreaming(dashPrompt, 'gpt-5.4', () => undefined);

    const recordedArgs = JSON.parse(readFileSync(argsPath, 'utf8')) as string[];
    const separatorIndex = recordedArgs.indexOf('--');
    expect(separatorIndex).toBeGreaterThan(-1);
    expect(recordedArgs[separatorIndex + 1]).toBe(dashPrompt);
    expect(recordedArgs[recordedArgs.length - 1]).toBe(dashPrompt);
  });

  test('executePromptStreaming does not save a first-run session marker when Codex returns no output', async () => {
    const fakeCodexPath = join(TEST_HOME, 'fake-codex');
    writeFakeCodex(fakeCodexPath);
    process.env.CODEX_BIN = fakeCodexPath;
    process.env.CODEX_FAKE_MODE = 'empty';

    const convDir = join(TEST_HOME, 'empty-session-conv');
    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', '', () => undefined)).rejects.toThrow(
      'Agent process completed successfully but returned no output'
    );
    expect(existsSync(join(convDir, '.codex_session'))).toBe(false);
  });
  test('executePromptStreaming clears stale session marker when Codex reports missing conversation', async () => {
    const fakeCodexPath = join(TEST_HOME, 'fake-codex');
    const argsPath = join(TEST_HOME, 'codex-missing-session-args.json');
    writeFakeCodex(fakeCodexPath);
    process.env.CODEX_BIN = fakeCodexPath;
    process.env.CODEX_FAKE_ARGS_PATH = argsPath;
    process.env.CODEX_FAKE_MODE = 'missing-session';
    process.env.CODEX_FAKE_THREAD_ID = 'stale-thread-id';

    const convDir = join(TEST_HOME, 'missing-session-conv');
    mkdirSync(convDir, { recursive: true });
    writeFileSync(join(convDir, '.codex_session'), 'stale-thread-id');

    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('continue', 'gpt-5.4', () => undefined)).rejects.toThrow(
      'No conversation found with session ID: stale-thread-id'
    );
    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      'exec',
      'resume',
      '-m',
      'gpt-5.4',
      '--color',
      'never',
      '--dangerously-bypass-approvals-and-sandbox',
      '--json',
      'stale-thread-id',
      '--',
      'continue',
    ]);
    expect(existsSync(join(convDir, '.codex_session'))).toBe(false);
  });

  test('executePromptStreaming uses Codex app-server with shared workspace and per-conversation marker', async () => {
    process.env.CODEX_AGENT_TRANSPORT = 'app-server';
    const fakeCodexPath = join(TEST_HOME, 'fake-codex-app-server');
    const requestsPath = join(TEST_HOME, 'codex-app-requests.jsonl');
    writeFakeCodexAppServer(fakeCodexPath);
    process.env.CODEX_BIN = fakeCodexPath;
    process.env.CODEX_FAKE_REQUESTS_PATH = requestsPath;
    process.env.CODEX_FAKE_THREAD_ID = 'thread-app-new';
    process.env.CODEX_FAKE_MESSAGE = 'from app server';

    const defaultDir = join(TEST_HOME, 'default-data');
    const convDir = join(TEST_HOME, 'conversations', 'app-new');
    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getDefaultConversationDataDir: () => defaultDir,
      getConversationId: () => 'app-new',
      getEncryptionKey: () => undefined,
    });
    const chunks: string[] = [];
    const usage: Array<{ inputTokens: number; outputTokens: number }> = [];

    await strategy.executePromptStreaming(
      'hello',
      'gpt-5.4',
      (chunk) => chunks.push(chunk),
      { onUsage: (u) => usage.push(u) },
      undefined,
      { effort: 'high' },
    );

    const requests = readJsonl(requestsPath);
    const threadStart = requests.find((request) => request.method === 'thread/start') as { params: Record<string, unknown> };
    const turnStart = requests.find((request) => request.method === 'turn/start') as { params: Record<string, unknown> };

    expect(threadStart.params.cwd).toBe(join(defaultDir, 'codex_workspace'));
    expect(turnStart.params.cwd).toBe(join(defaultDir, 'codex_workspace'));
    expect(turnStart.params.effort).toBe('high');
    expect(readFileSync(join(convDir, '.codex_session'), 'utf8')).toBe('thread-app-new');
    expect(existsSync(join(defaultDir, 'codex_workspace'))).toBe(true);
    expect(chunks).toEqual(['from app server']);
    expect(usage).toEqual([{ inputTokens: 3, outputTokens: 4 }]);
  });

  test('executePromptStreaming resumes Codex app-server thread from conversation marker', async () => {
    process.env.CODEX_AGENT_TRANSPORT = 'app-server';
    const fakeCodexPath = join(TEST_HOME, 'fake-codex-app-server');
    const requestsPath = join(TEST_HOME, 'codex-app-resume-requests.jsonl');
    writeFakeCodexAppServer(fakeCodexPath);
    process.env.CODEX_BIN = fakeCodexPath;
    process.env.CODEX_FAKE_REQUESTS_PATH = requestsPath;

    const convDir = join(TEST_HOME, 'conversations', 'app-resume');
    mkdirSync(convDir, { recursive: true });
    writeFileSync(join(convDir, '.codex_session'), 'thread-existing-app');
    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'app-resume',
      getEncryptionKey: () => undefined,
    });

    await strategy.executePromptStreaming('continue', 'gpt-5.4', () => undefined);

    const requests = readJsonl(requestsPath);
    const resume = requests.find((request) => request.method === 'thread/resume') as { params: Record<string, unknown> };
    expect(resume.params.threadId).toBe('thread-existing-app');
    expect(requests.some((request) => request.method === 'thread/start')).toBe(false);
    expect(readFileSync(join(convDir, '.codex_session'), 'utf8')).toBe('thread-existing-app');
  });

  test('steerAgent sends turn/steer to active Codex app-server turn', async () => {
    process.env.CODEX_AGENT_TRANSPORT = 'app-server';
    const fakeCodexPath = join(TEST_HOME, 'fake-codex-app-server');
    const requestsPath = join(TEST_HOME, 'codex-app-steer-requests.jsonl');
    writeFakeCodexAppServer(fakeCodexPath);
    process.env.CODEX_BIN = fakeCodexPath;
    process.env.CODEX_FAKE_REQUESTS_PATH = requestsPath;
    process.env.CODEX_FAKE_TURN_DELAY_MS = '120';

    const convDir = join(TEST_HOME, 'conversations', 'app-steer');
    const strategy = new OpenaiCodexStrategy(false, {
      getConversationDataDir: () => convDir,
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'app-steer',
      getEncryptionKey: () => undefined,
    });

    const promise = strategy.executePromptStreaming('hello', 'gpt-5.4', () => undefined);
    await waitFor(() => existsSync(requestsPath) && readJsonl(requestsPath).some((request) => request.method === 'turn/start'));
    strategy.steerAgent('adjust course');
    await promise;

    const steer = readJsonl(requestsPath).find((request) => request.method === 'turn/steer') as { params: Record<string, unknown> };
    expect(steer.params.threadId).toBe('thread-app');
    expect(steer.params.expectedTurnId).toBe('turn-app');
    expect(steer.params.input).toEqual([{ type: 'text', text: 'adjust course', text_elements: [] }]);
  });
});
