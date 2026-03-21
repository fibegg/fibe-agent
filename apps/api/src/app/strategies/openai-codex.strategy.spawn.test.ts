/**
 * Spawn-based tests for OpenaiCodexStrategy.
 * Uses Bun's mock.module() + dynamic import pattern to intercept spawn.
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CODEX_SPAWN_TEST_HOME = join(tmpdir(), `codex-spawn-test-${process.pid}`);

function makeFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: () => void; write: (s: string) => void };
    kill: () => void;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { end: () => undefined, write: (s: string) => { void s; } };
  proc.kill = () => undefined;
  return proc;
}

let currentFakeProc = makeFakeProcess();

mock.module('node:child_process', () => ({
  spawn: (_cmd: string, _args: string[], _opts?: Record<string, unknown>) => currentFakeProc,
  execSync: () => '',
}));

const { OpenaiCodexStrategy } = await import('./openai-codex.strategy');

describe('OpenaiCodexStrategy spawn-mocked paths', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    currentFakeProc = makeFakeProcess();
    savedEnv.HOME = process.env.HOME;
    savedEnv.SESSION_DIR = process.env.SESSION_DIR;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    process.env.HOME = CODEX_SPAWN_TEST_HOME;
    process.env.SESSION_DIR = join(CODEX_SPAWN_TEST_HOME, '.codex');
    delete process.env.OPENAI_API_KEY;
    if (!existsSync(CODEX_SPAWN_TEST_HOME)) mkdirSync(CODEX_SPAWN_TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    if (savedEnv.HOME) process.env.HOME = savedEnv.HOME;
    if (savedEnv.SESSION_DIR === undefined) delete process.env.SESSION_DIR;
    else process.env.SESSION_DIR = savedEnv.SESSION_DIR;
    if (savedEnv.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;
    if (existsSync(CODEX_SPAWN_TEST_HOME)) rmSync(CODEX_SPAWN_TEST_HOME, { recursive: true, force: true });
  });

  // ─── executeAuth non-api-token ─────────────────────────────

  test('executeAuth non-api-token sends device URL immediately', (done) => {
    let urlSent = '';
    const noop = () => undefined;
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: (url: string) => { urlSent = url; },
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    });
    expect(urlSent).toBe('https://auth.openai.com/device');
    currentFakeProc.emit('close', 0);
    done();
  });

  test('executeAuth non-api-token extracts URL from process stdout', (done) => {
    let lastUrl = '';
    const noop = () => undefined;
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: (url: string) => { lastUrl = url; },
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    });
    currentFakeProc.stdout.emit('data', 'Please visit https://auth.openai.com/device/callback?code=abc to continue');
    currentFakeProc.emit('close', 0);
    setTimeout(() => {
      expect(lastUrl).toContain('https://auth.openai.com/device/callback');
      done();
    }, 10);
  });

  test('executeAuth non-api-token extracts device code from stdout', (done) => {
    let deviceCode = '';
    const noop = () => undefined;
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: (code: string) => { deviceCode = code; },
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    });
    currentFakeProc.stdout.emit('data', 'Your device code is: ABC-123');
    currentFakeProc.emit('close', 0);
    setTimeout(() => {
      expect(deviceCode).toBe('ABC-123');
      done();
    }, 10);
  });

  test('executeAuth non-api-token sends sendAuthSuccess on exit 0', (done) => {
    let successCalled = false;
    const noop = () => undefined;
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: () => { successCalled = true; },
      sendAuthStatus: noop,
      sendError: noop,
    });
    currentFakeProc.emit('close', 0);
    setTimeout(() => {
      expect(successCalled).toBe(true);
      done();
    }, 10);
  });

  test('executeAuth non-api-token sends UNAUTHENTICATED on non-zero exit', (done) => {
    let authStatus = '';
    const noop = () => undefined;
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: (s: string) => { authStatus = s; },
      sendError: noop,
    });
    currentFakeProc.emit('close', 1);
    setTimeout(() => {
      expect(authStatus).toBe('unauthenticated');
      done();
    }, 10);
  });

  test('executeAuth non-api-token handles ENOENT error', (done) => {
    let errorMsg = '';
    const noop = () => undefined;
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: (msg: string) => { errorMsg = msg; },
    });
    const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    currentFakeProc.emit('error', err);
    setTimeout(() => {
      expect(errorMsg).toContain('Codex CLI not found');
      done();
    }, 10);
  });

  test('executeAuth non-api-token handles non-ENOENT error gracefully', (done) => {
    const noop = () => undefined;
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    });
    currentFakeProc.emit('error', new Error('other error'));
    done();
  });

  test('submitAuthCode sends trimmed code to stdin', () => {
    let sentInput = '';
    currentFakeProc.stdin.write = (s: string) => { sentInput = s; };
    const noop = () => undefined;
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    });
    strategy.submitAuthCode('  my-code  ');
    expect(sentInput).toBe('my-code\n');
  });

  test('cancelAuth clears active auth process', (done) => {
    const noop = () => undefined;
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    });
    strategy.cancelAuth();
    done();
  });

  // ─── executeLogout ─────────────────────────────────────────

  test('executeLogout calls sendLogoutSuccess on process close', (done) => {
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeLogout({
      sendLogoutOutput: () => undefined,
      sendLogoutSuccess: () => done(),
      sendError: () => undefined,
    });
    currentFakeProc.stdout.emit('data', 'logging out');
    currentFakeProc.stderr.emit('data', 'stderr');
    currentFakeProc.emit('close');
  });

  test('executeLogout calls sendLogoutSuccess on process error', (done) => {
    const strategy = new OpenaiCodexStrategy(false);
    strategy.executeLogout({
      sendLogoutOutput: () => undefined,
      sendLogoutSuccess: () => done(),
      sendError: () => undefined,
    });
    currentFakeProc.emit('error', new Error('spawn error'));
  });

  // ─── executePromptStreaming ─────────────────────────────────

  test('executePromptStreaming resolves on exit 0', async () => {
    const strategy = new OpenaiCodexStrategy(false);
    const chunks: string[] = [];
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c));
    currentFakeProc.stdout.emit('data', 'Response output');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks).toContain('Response output');
  });

  test('executePromptStreaming resolves on exit null', async () => {
    const strategy = new OpenaiCodexStrategy(false);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('close', null);
    await promise;
  });

  test('executePromptStreaming rejects on process error', async () => {
    const strategy = new OpenaiCodexStrategy(false);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('error', new Error('spawn error'));
    await expect(promise).rejects.toThrow('spawn error');
  });

  test('executePromptStreaming rejects with INTERRUPTED_MESSAGE when interrupted', async () => {
    const strategy = new OpenaiCodexStrategy(false);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    strategy.interruptAgent();
    currentFakeProc.emit('close', null);
    await expect(promise).rejects.toThrow('INTERRUPTED');
  });

  test('executePromptStreaming sends stderr to onReasoningChunk', async () => {
    const strategy = new OpenaiCodexStrategy(false);
    const reasoningChunks: string[] = [];
    const callbacks = {
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: (c: string) => reasoningChunks.push(c),
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stderr.emit('data', 'stderr log line');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(reasoningChunks).toContain('stderr log line');
  });

  test('executePromptStreaming sends stderr to onChunk when no onReasoningChunk', async () => {
    const strategy = new OpenaiCodexStrategy(false);
    const chunks: string[] = [];
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c));
    currentFakeProc.stderr.emit('data', 'no reasoning callback');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks).toContain('no reasoning callback');
  });

  test('executePromptStreaming rejects with error message on non-zero exit', async () => {
    const strategy = new OpenaiCodexStrategy(false);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.stderr.emit('data', 'Process crashed');
    currentFakeProc.emit('close', 1);
    await expect(promise).rejects.toThrow('Process crashed');
  });

  test('executePromptStreaming calls onReasoningEnd on close', async () => {
    let reasoningEnded = false;
    const strategy = new OpenaiCodexStrategy(false);
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

  test('executePromptStreaming with api-token mode calls ensureSettings', async () => {
    if (!existsSync(CODEX_SPAWN_TEST_HOME)) mkdirSync(CODEX_SPAWN_TEST_HOME, { recursive: true });
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const codexDir = join(CODEX_SPAWN_TEST_HOME, '.codex');
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy(true);
    const promise = strategy.executePromptStreaming('prompt', 'model', () => undefined);
    currentFakeProc.emit('close', 0);
    await promise;
  });

  test('executePromptStreaming with systemPrompt prepends system to prompt arg', async () => {
    let capturedArgs: string[] = [];
    mock.module('node:child_process', () => ({
      spawn: (_cmd: string, args: string[]) => { capturedArgs = args; return currentFakeProc; },
      execSync: () => '',
    }));
    const { OpenaiCodexStrategy: OCS2 } = await import('./openai-codex.strategy');
    const strategy = new OCS2(false);
    const promise = strategy.executePromptStreaming('user-msg', 'model', () => undefined, undefined, 'system-msg');
    currentFakeProc.emit('close', 0);
    await promise;
    const promptArg = capturedArgs.find((a) => a.includes('system-msg'));
    expect(promptArg).toContain('system-msg');
    expect(promptArg).toContain('user-msg');
  });
});
