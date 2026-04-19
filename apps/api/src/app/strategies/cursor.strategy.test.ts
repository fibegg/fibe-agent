import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
  return { errorResult: '', lastAssistantChunk: '', hasStartedReasoning: false };
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
  });
});

describe('CursorStrategy', () => {
  let testHome = '';

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), 'cursor-strategy-test-'));
    process.env.SESSION_DIR = testHome;
    delete process.env.CURSOR_API_KEY;
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
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
});
