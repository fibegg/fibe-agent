import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CursorStrategy,
  handleCursorExecJsonLine,
  type CursorExecJsonHandlers,
  type CursorExecJsonState,
} from './cursor.strategy';
import type { ToolEvent } from './strategy.types';

function mkEvent(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

function freshState(): CursorExecJsonState {
  return { errorResult: '', lastAssistantChunk: '', hasStartedReasoning: false, hasEmittedOutput: false };
}

function writeFakeCursor(path: string): void {
  writeFileSync(path, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.CURSOR_FAKE_ARGS_PATH) {
  fs.writeFileSync(process.env.CURSOR_FAKE_ARGS_PATH, JSON.stringify(args));
}
if (process.env.CURSOR_FAKE_MODE === 'error') {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: process.env.CURSOR_FAKE_SESSION_ID || 'session-error', model: 'Composer 2' }));
  console.error('fake cursor failed');
  process.exit(7);
}
if (process.env.CURSOR_FAKE_MODE === 'empty') {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: process.env.CURSOR_FAKE_SESSION_ID || 'session-empty', model: 'Composer 2' }));
  process.exit(0);
}
if (process.env.CURSOR_FAKE_EMIT_SESSION !== 'false') {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: process.env.CURSOR_FAKE_SESSION_ID || 'session-new', model: 'Composer 2' }));
}
if (process.env.CURSOR_FAKE_OUTPUT_MODE === 'tool') {
  console.log(JSON.stringify({ type: 'tool_call', subtype: 'started', tool_call: { shellToolCall: { args: { command: 'pwd' } } } }));
} else {
  console.log(JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: process.env.CURSOR_FAKE_MESSAGE || 'fake response' }] } }));
}
console.log(JSON.stringify({ type: 'result', result: process.env.CURSOR_FAKE_RESULT || '', usage: { inputTokens: 1, outputTokens: 2 } }));
`, { mode: 0o755 });
  chmodSync(path, 0o755);
}

interface Spy {
  chunks: string[];
  reasoning: string[];
  reasoningStartCount: number;
  reasoningEndCount: number;
  tools: ToolEvent[];
  sessionIds: string[];
  usage: Array<{ inputTokens: number; outputTokens: number }>;
  handlers: CursorExecJsonHandlers;
}

function createSpy(): Spy {
  const spy: Spy = {
    chunks: [],
    reasoning: [],
    reasoningStartCount: 0,
    reasoningEndCount: 0,
    tools: [],
    sessionIds: [],
    usage: [],
    handlers: {} as CursorExecJsonHandlers,
  };
  spy.handlers = {
    onChunk: (c) => spy.chunks.push(c),
    onReasoningStart: () => spy.reasoningStartCount++,
    onReasoningChunk: (t) => spy.reasoning.push(t),
    onReasoningEnd: () => spy.reasoningEndCount++,
    onTool: (e) => spy.tools.push(e),
    onSessionId: (sessionId) => spy.sessionIds.push(sessionId),
    onUsage: (usage) => spy.usage.push(usage),
  };
  return spy;
}

describe('handleCursorExecJsonLine', () => {
  test('system init starts reasoning and captures session id', () => {
    const state = freshState();
    const spy = createSpy();
    handleCursorExecJsonLine(
      mkEvent({ type: 'system', subtype: 'init', model: 'Composer 2', session_id: 'session-1' }),
      state,
      spy.handlers
    );
    expect(spy.reasoningStartCount).toBe(1);
    expect(spy.reasoning).toEqual(['Model: Composer 2\n']);
    expect(spy.sessionIds).toEqual(['session-1']);
    expect(state.hasEmittedOutput).toBe(false);
  });

  test('assistant content is streamed as chunks and reasoning previews', () => {
    const state = freshState();
    const spy = createSpy();
    handleCursorExecJsonLine(
      mkEvent({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'I will inspect the repo.' }] },
        session_id: 'session-2',
      }),
      state,
      spy.handlers
    );
    expect(spy.reasoningStartCount).toBe(1);
    expect(spy.reasoning).toEqual(['I will inspect the repo.']);
    expect(spy.chunks).toEqual(['I will inspect the repo.']);
    expect(state.hasEmittedOutput).toBe(true);
  });

  test('duplicate assistant chunks are ignored', () => {
    const state = freshState();
    const spy = createSpy();
    const event = mkEvent({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'repeat' }] },
    });
    handleCursorExecJsonLine(event, state, spy.handlers);
    handleCursorExecJsonLine(event, state, spy.handlers);
    expect(spy.chunks).toEqual(['repeat']);
  });

  test('tool calls emit file events for file tools', () => {
    const state = freshState();
    const spy = createSpy();
    handleCursorExecJsonLine(
      mkEvent({
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          writeToolCall: {
            args: {
              path: 'summary.txt',
              fileText: 'hello',
            },
          },
        },
      }),
      state,
      spy.handlers
    );
    expect(spy.tools).toEqual([
      {
        kind: 'file_created',
        name: 'summary.txt',
        path: 'summary.txt',
        summary: 'writeToolCall',
      },
    ]);
    expect(state.hasEmittedOutput).toBe(true);
  });

  test('result ends reasoning', () => {
    const state = freshState();
    const spy = createSpy();
    handleCursorExecJsonLine(
      mkEvent({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      }),
      state,
      spy.handlers
    );
    handleCursorExecJsonLine(mkEvent({ type: 'result', result: 'done' }), state, spy.handlers);
    expect(spy.reasoningEndCount).toBe(1);
  });

  test('result forwards token usage when present', () => {
    const state = freshState();
    const spy = createSpy();
    handleCursorExecJsonLine(
      mkEvent({
        type: 'result',
        result: 'done',
        usage: { inputTokens: 12, outputTokens: 34 },
      }),
      state,
      spy.handlers
    );
    expect(spy.usage).toEqual([{ inputTokens: 12, outputTokens: 34 }]);
    expect(state.hasEmittedOutput).toBe(true);
  });

  test('error events mark useful output and accumulate error text', () => {
    const state = freshState();
    const spy = createSpy();
    handleCursorExecJsonLine(mkEvent({ type: 'error', error: 'rate limited' }), state, spy.handlers);

    expect(state.errorResult).toBe('rate limited');
    expect(state.hasEmittedOutput).toBe(true);
    expect(spy.chunks).toEqual(['⚠️ rate limited']);
  });

  test('non-json fallback text marks useful output', () => {
    const state = freshState();
    const spy = createSpy();
    handleCursorExecJsonLine('plain cursor output', state, spy.handlers);

    expect(state.hasEmittedOutput).toBe(true);
    expect(spy.chunks).toEqual(['plain cursor output']);
  });
});

describe('CursorStrategy', () => {
  let testHome = '';
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    testHome = mkdtempSync(join(tmpdir(), 'cursor-strategy-test-'));
    process.env.SESSION_DIR = testHome;
    delete process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_AGENT_BIN;
    delete process.env.CURSOR_FAKE_ARGS_PATH;
    delete process.env.CURSOR_FAKE_MODE;
    delete process.env.CURSOR_FAKE_SESSION_ID;
    delete process.env.CURSOR_FAKE_EMIT_SESSION;
    delete process.env.CURSOR_FAKE_MESSAGE;
    delete process.env.CURSOR_FAKE_OUTPUT_MODE;
    delete process.env.CURSOR_FAKE_RESULT;
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
    process.env = originalEnv;
  });

  test('getModelArgs returns cursor model flag', () => {
    const strategy = new CursorStrategy(true);
    expect(strategy.getModelArgs?.('Composer 2')).toEqual(['--model', 'Composer 2']);
  });

  test('checkAuthStatus returns false without CURSOR_API_KEY', async () => {
    const prev = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    const strategy = new CursorStrategy(true);
    expect(await strategy.checkAuthStatus()).toBe(false);
    process.env.CURSOR_API_KEY = prev;
  });

  test('submitAuthCode stores pasted key and marks auth as available', async () => {
    const strategy = new CursorStrategy(true);
    let success = false;
    strategy.executeAuth({
      sendAuthUrlGenerated: () => {},
      sendDeviceCode: () => {},
      sendAuthManualToken: () => {},
      sendAuthSuccess: () => {
        success = true;
      },
      sendAuthStatus: () => {},
      sendError: () => {},
    });

    strategy.submitAuthCode('cursor-key-123');

    expect(success).toBe(true);
    expect(await strategy.checkAuthStatus()).toBe(true);
    expect(existsSync(join(testHome, 'auth.json'))).toBe(true);
  });

  test('executeAuth succeeds when a stored key already exists', () => {
    const strategy = new CursorStrategy(true);
    strategy.submitAuthCode('cursor-key-123');

    let success = false;
    let manualTokenPrompted = false;

    strategy.executeAuth({
      sendAuthUrlGenerated: () => {},
      sendDeviceCode: () => {},
      sendAuthManualToken: () => {
        manualTokenPrompted = true;
      },
      sendAuthSuccess: () => {
        success = true;
      },
      sendAuthStatus: () => {},
      sendError: () => {},
    });

    expect(success).toBe(true);
    expect(manualTokenPrompted).toBe(false);
  });

  test('buildExecArgs inserts separator before prompt text', () => {
    const strategy = new CursorStrategy(true) as unknown as {
      buildExecArgs: (prompt: string, model: string, sessionId: string | null) => string[];
    };

    expect(strategy.buildExecArgs('---\nfrontmatter-like prompt', 'Auto', null)).toEqual([
      '--print',
      '--output-format',
      'stream-json',
      '--force',
      '--model',
      'Auto',
      '--',
      '---\nfrontmatter-like prompt',
    ]);
  });

  test('executePromptStreaming saves captured session id after successful useful output', async () => {
    const fakeCursorPath = join(testHome, 'fake-cursor-agent');
    const argsPath = join(testHome, 'cursor-args.json');
    writeFakeCursor(fakeCursorPath);
    process.env.CURSOR_AGENT_BIN = fakeCursorPath;
    process.env.CURSOR_FAKE_ARGS_PATH = argsPath;
    process.env.CURSOR_FAKE_SESSION_ID = 'session-new';

    const convDir = join(testHome, 'conv-data');
    const strategy = new CursorStrategy(true, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });
    const chunks: string[] = [];

    await strategy.executePromptStreaming('hello', 'Composer 2', (chunk) => chunks.push(chunk));

    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      '--print',
      '--output-format',
      'stream-json',
      '--force',
      '--model',
      'Composer 2',
      '--',
      'hello',
    ]);
    expect(chunks).toEqual(['fake response']);
    expect(readFileSync(join(convDir, 'cursor_workspace', '.cursor_session'), 'utf8')).toBe('session-new');
    expect(strategy.hasNativeSessionSupport()).toBe(true);
  });

  test('executePromptStreaming does not save captured session id after failed run', async () => {
    const fakeCursorPath = join(testHome, 'fake-cursor-agent');
    writeFakeCursor(fakeCursorPath);
    process.env.CURSOR_AGENT_BIN = fakeCursorPath;
    process.env.CURSOR_FAKE_MODE = 'error';
    process.env.CURSOR_FAKE_SESSION_ID = 'session-failed';

    const convDir = join(testHome, 'failed-conv');
    const strategy = new CursorStrategy(true, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', '', () => undefined)).rejects.toThrow('fake cursor failed');
    expect(existsSync(join(convDir, 'cursor_workspace', '.cursor_session'))).toBe(false);
  });

  test('executePromptStreaming rejects successful empty run and does not save first-run marker', async () => {
    const fakeCursorPath = join(testHome, 'fake-cursor-agent');
    writeFakeCursor(fakeCursorPath);
    process.env.CURSOR_AGENT_BIN = fakeCursorPath;
    process.env.CURSOR_FAKE_MODE = 'empty';
    process.env.CURSOR_FAKE_SESSION_ID = 'session-empty';

    const convDir = join(testHome, 'empty-conv');
    const strategy = new CursorStrategy(true, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', '', () => undefined)).rejects.toThrow(
      'Agent process completed successfully but returned no output'
    );
    expect(existsSync(join(convDir, 'cursor_workspace', '.cursor_session'))).toBe(false);
  });

  test('executePromptStreaming resumes existing session and preserves marker when no new session id is emitted', async () => {
    const fakeCursorPath = join(testHome, 'fake-cursor-agent');
    const argsPath = join(testHome, 'cursor-resume-args.json');
    writeFakeCursor(fakeCursorPath);
    process.env.CURSOR_AGENT_BIN = fakeCursorPath;
    process.env.CURSOR_FAKE_ARGS_PATH = argsPath;
    process.env.CURSOR_FAKE_EMIT_SESSION = 'false';

    const convDir = join(testHome, 'resume-conv');
    const markerDir = join(convDir, 'cursor_workspace');
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(join(markerDir, '.cursor_session'), 'session-existing');

    const strategy = new CursorStrategy(true, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await strategy.executePromptStreaming('continue', '', () => undefined);

    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      '--print',
      '--output-format',
      'stream-json',
      '--force',
      '--resume',
      'session-existing',
      '--',
      'continue',
    ]);
    expect(readFileSync(join(markerDir, '.cursor_session'), 'utf8')).toBe('session-existing');
  });

  test('executePromptStreaming treats tool events as useful output', async () => {
    const fakeCursorPath = join(testHome, 'fake-cursor-agent');
    writeFakeCursor(fakeCursorPath);
    process.env.CURSOR_AGENT_BIN = fakeCursorPath;
    process.env.CURSOR_FAKE_OUTPUT_MODE = 'tool';

    const convDir = join(testHome, 'tool-output-conv');
    const strategy = new CursorStrategy(true, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await strategy.executePromptStreaming('hello', '', () => undefined);

    expect(readFileSync(join(convDir, 'cursor_workspace', '.cursor_session'), 'utf8')).toBe('session-new');
  });
});
