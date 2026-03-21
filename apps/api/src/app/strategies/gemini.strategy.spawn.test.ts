/**
 * Spawn-based tests for GeminiStrategy.
 * Uses Bun's mock.module() + dynamic import pattern to intercept spawn.
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const GEMINI_SPAWN_TEST_HOME = join(tmpdir(), `gemini-spawn-test-${process.pid}`);

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

const { GeminiStrategy } = await import('./gemini.strategy');

describe('GeminiStrategy spawn-mocked paths', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    currentFakeProc = makeFakeProcess();
    savedEnv.HOME = process.env.HOME;
    savedEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    process.env.HOME = GEMINI_SPAWN_TEST_HOME;
    delete process.env.GEMINI_API_KEY;
    if (!existsSync(GEMINI_SPAWN_TEST_HOME)) mkdirSync(GEMINI_SPAWN_TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    if (savedEnv.HOME) process.env.HOME = savedEnv.HOME;
    if (savedEnv.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedEnv.GEMINI_API_KEY;
    if (existsSync(GEMINI_SPAWN_TEST_HOME)) rmSync(GEMINI_SPAWN_TEST_HOME, { recursive: true, force: true });
  });

  // ─── ensureSettings ──────────────────────────────────────────

  test('ensureSettings creates .gemini dir and settings.json', () => {
    const strategy = new GeminiStrategy(true);
    strategy.ensureSettings();
    // GEMINI_CONFIG_DIR is a module-level constant resolved at module load time from os.homedir()
    const geminiDir = join(homedir(), '.gemini');
    expect(existsSync(join(geminiDir, 'settings.json'))).toBe(true);
  });

  test('ensureSettings merges with existing settings.json', () => {
    // GEMINI_CONFIG_DIR is resolved at module load time from real HOME
    const geminiDir = join(homedir(), '.gemini');
    const settingsPath = join(geminiDir, 'settings.json');
    const { readFileSync } = require('node:fs');
    let original: string | null = null;
    try { original = readFileSync(settingsPath, 'utf8'); } catch { /* may not exist */ }
    try {
      mkdirSync(geminiDir, { recursive: true });
      writeFileSync(settingsPath, JSON.stringify({ theme: 'dark' }));
      const strategy = new GeminiStrategy(true);
      strategy.ensureSettings();
      const content = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(content.theme).toBe('dark');
      expect(content.security?.auth?.selectedType).toBe('oauth-personal');
    } finally {
      // Restore original settings
      if (original !== null) writeFileSync(settingsPath, original);
    }
  });

  test('ensureSettings handles malformed existing settings.json gracefully', () => {
    const geminiDir = join(GEMINI_SPAWN_TEST_HOME, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(join(geminiDir, 'settings.json'), 'not-json');
    const strategy = new GeminiStrategy(true);
    expect(() => strategy.ensureSettings()).not.toThrow();
  });

  // ─── executeLogout non-api-token ─────────────────────────────

  test('executeLogout non-api-token calls sendLogoutSuccess on process close', (done) => {
    const strategy = new GeminiStrategy(false);
    strategy.executeLogout({
      sendLogoutOutput: () => undefined,
      sendLogoutSuccess: () => done(),
      sendError: () => undefined,
    });
    currentFakeProc.stdout.emit('data', 'logging out');
    currentFakeProc.stderr.emit('data', 'stderr output');
    currentFakeProc.emit('close');
  });

  test('executeLogout non-api-token calls sendLogoutSuccess on process error', (done) => {
    const strategy = new GeminiStrategy(false);
    strategy.executeLogout({
      sendLogoutOutput: () => undefined,
      sendLogoutSuccess: () => done(),
      sendError: () => undefined,
    });
    currentFakeProc.emit('error', new Error('spawn error'));
  });

  // ─── checkAuthStatus non-api-token ───────────────────────────

  test('checkAuthStatus non-api-token returns true on exit code 0', (done) => {
    const strategy = new GeminiStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(true);
      done();
    });
    currentFakeProc.emit('close', 0);
  });

  test('checkAuthStatus non-api-token returns true on exit code 42 with stdin flag', (done) => {
    const strategy = new GeminiStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(true);
      done();
    });
    currentFakeProc.stderr.emit('data', 'No input provided via stdin');
    currentFakeProc.emit('close', 42);
  });

  test('checkAuthStatus non-api-token returns false when auth URL appears', (done) => {
    const strategy = new GeminiStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(false);
      done();
    });
    currentFakeProc.stdout.emit('data', 'Please visit https://accounts.google.com/o/oauth2/auth?client_id=test');
    currentFakeProc.emit('close', 1);
  });

  test('checkAuthStatus non-api-token returns false on non-zero exit', (done) => {
    const strategy = new GeminiStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(false);
      done();
    });
    currentFakeProc.emit('close', 1);
  });

  test('checkAuthStatus non-api-token returns false on spawn error', (done) => {
    const strategy = new GeminiStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(false);
      done();
    });
    currentFakeProc.emit('error', new Error('spawn failed'));
  });

  test('checkAuthStatus non-api-token returns false when waiting for authentication', (done) => {
    const strategy = new GeminiStrategy(false);
    strategy.checkAuthStatus().then((result) => {
      expect(result).toBe(false);
      done();
    });
    currentFakeProc.stderr.emit('data', 'Waiting for authentication...');
    currentFakeProc.emit('close', 1);
  });

  // ─── submitAuthCode non-api-token ────────────────────────────

  test('submitAuthCode non-api-token writes to stdin of active auth process', (done) => {
    let stdinInput = '';
    currentFakeProc.stdin.write = (s: string) => { stdinInput = s; };
    const strategy = new GeminiStrategy(false);
    const noop = () => undefined;
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    });
    strategy.submitAuthCode('auth-code-123');
    expect(stdinInput).toBe('auth-code-123\n');
    // Close the auth process; wrap done to avoid passing exit code as error
    currentFakeProc.on('close', () => done());
    currentFakeProc.emit('close', 0);
  });

  // ─── executePromptStreaming ───────────────────────────────────

  test('executePromptStreaming resolves on exit code 0', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const chunks: string[] = [];
    const promise = strategy.executePromptStreaming('hello', 'model', (c) => chunks.push(c));
    currentFakeProc.stdout.emit('data', 'Response text');
    currentFakeProc.emit('close', 0);
    await promise;
    expect(chunks).toContain('Response text');
  });

  test('executePromptStreaming resolves on exit code null', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('close', null);
    await promise;
  });

  test('executePromptStreaming rejects on process error event', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('error', new Error('spawn error'));
    await expect(promise).rejects.toThrow('spawn error');
  });

  test('executePromptStreaming rejects with INTERRUPTED_MESSAGE when interrupted', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    strategy.interruptAgent();
    currentFakeProc.emit('close', null);
    await expect(promise).rejects.toThrow('INTERRUPTED');
  });

  test('executePromptStreaming detects auth URL in stdout and rejects', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.stdout.emit('data', 'Please visit https://accounts.google.com/o/oauth2/auth?client_id=test to authenticate');
    currentFakeProc.emit('close', 1);
    await expect(promise).rejects.toThrow('Authentication required');
  });

  test('executePromptStreaming detects auth URL in stderr and rejects', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const callbacks = {
      onAuthRequired: () => undefined,
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks);
    currentFakeProc.stderr.emit('data', 'Error: please auth at https://accounts.google.com/o/oauth2/auth?client_id=test');
    currentFakeProc.emit('close', 1);
    await expect(promise).rejects.toThrow('Authentication required');
  });

  test('executePromptStreaming calls onAuthRequired callback for auth URL', (done) => {
    process.env.GEMINI_API_KEY = 'test-key';
    let authUrl = '';
    const strategy = new GeminiStrategy(true);
    const callbacks = {
      onAuthRequired: (url: string) => { authUrl = url; },
      onReasoningStart: () => undefined,
      onReasoningEnd: () => undefined,
      onReasoningChunk: () => undefined,
      onTool: () => undefined,
      onUsage: () => undefined,
    };
    strategy.executePromptStreaming('hello', 'model', () => undefined, callbacks).catch(() => {
      expect(authUrl).toContain('accounts.google.com');
      done();
    });
    currentFakeProc.stdout.emit('data', 'https://accounts.google.com/o/oauth2/auth?client_id=test');
    currentFakeProc.emit('close', 1);
  });

  test('executePromptStreaming rejects with model not found error', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.stderr.emit('data', 'ModelNotFoundError: model not found');
    currentFakeProc.emit('close', 1);
    await expect(promise).rejects.toThrow('Invalid model specified');
  });

  test('executePromptStreaming rejects with rate limited error', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.stderr.emit('data', 'Error: RESOURCE_EXHAUSTED quota exceeded');
    currentFakeProc.emit('close', 1);
    await expect(promise).rejects.toThrow('rate limited');
  });

  test('executePromptStreaming rejects with stderr error on non-zero exit', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.stderr.emit('data', 'Some unexpected error');
    currentFakeProc.emit('close', 2);
    await expect(promise).rejects.toThrow('STDERR');
  });

  test('executePromptStreaming creates session marker with conversationDataDir on success', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const convDir = join(GEMINI_SPAWN_TEST_HOME, 'gemini-conv');
    const strategy = new GeminiStrategy(true, { getConversationDataDir: () => convDir });
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('close', 0);
    await promise;
    expect(existsSync(join(convDir, 'gemini_workspace', '.gemini_session'))).toBe(true);
  });

  test('executePromptStreaming reads existing session for --resume flag', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const convDir = join(GEMINI_SPAWN_TEST_HOME, 'gemini-conv-resume');
    const workspaceDir = join(convDir, 'gemini_workspace');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, '.gemini_session'), '');
    let capturedArgs: string[] = [];
    mock.module('node:child_process', () => ({
      spawn: (_cmd: string, args: string[]) => { capturedArgs = args; return currentFakeProc; },
      execSync: () => '',
    }));
    const { GeminiStrategy: GS2 } = await import('./gemini.strategy');
    const strategy = new GS2(true, { getConversationDataDir: () => convDir });
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('close', 0);
    await promise;
    expect(capturedArgs).toContain('--resume');
  });

  test('executePromptStreaming with systemPrompt prepends to prompt', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    let capturedArgs: string[] = [];
    mock.module('node:child_process', () => ({
      spawn: (_cmd: string, args: string[]) => { capturedArgs = args; return currentFakeProc; },
      execSync: () => '',
    }));
    const { GeminiStrategy: GS3 } = await import('./gemini.strategy');
    const strategy = new GS3(true);
    const promise = strategy.executePromptStreaming('user-prompt', 'model', () => undefined, undefined, 'system');
    currentFakeProc.emit('close', 0);
    await promise;
    const fullPromptArg = capturedArgs[capturedArgs.indexOf('-p') + 1];
    expect(fullPromptArg).toContain('system');
    expect(fullPromptArg).toContain('user-prompt');
  });

  test('executePromptStreaming non-api-token mode works with checkAuthStatus=true', async () => {
    const strategy = new GeminiStrategy(false);
    const promise = strategy.executePromptStreaming('hello', 'model', () => undefined);
    currentFakeProc.emit('close', 0);
    await promise;
  });

  // ─── executeAuth onData handler (lines 78-91) ────────────────

  test('executeAuth onData: "No input provided via stdin" sets isCode42Expected', (done) => {
    const strategy = new GeminiStrategy(false);
    let authSuccessCalled = false;
    const noop = () => undefined;
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: () => { authSuccessCalled = true; },
      sendAuthStatus: noop,
      sendError: noop,
    });
    // auth-process-helper combines stdout and stderr through the same onData
    // The fake process's stdout/stderr events are forwarded via auth-process-helper
    currentFakeProc.stdout.emit('data', 'No input provided via stdin');
    currentFakeProc.emit('close', 42); // exits with 42 — now expected to succeed
    setTimeout(() => {
      expect(authSuccessCalled).toBe(true);
      done();
    }, 20);
  });

  test('executeAuth onData: "Loaded cached credentials" sets isCode42Expected', (done) => {
    const strategy = new GeminiStrategy(false);
    let authSuccessCalled = false;
    const noop = () => undefined;
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: () => { authSuccessCalled = true; },
      sendAuthStatus: noop,
      sendError: noop,
    });
    currentFakeProc.stdout.emit('data', 'Loaded cached credentials for user');
    currentFakeProc.emit('close', 42);
    setTimeout(() => {
      expect(authSuccessCalled).toBe(true);
      done();
    }, 20);
  });

  test('executeAuth onData: extracts Google OAuth URL from process output', (done) => {
    let extractedUrl = '';
    const noop = () => undefined;
    const strategy = new GeminiStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: (url: string) => { extractedUrl = url; },
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    });
    currentFakeProc.stdout.emit('data', 'Please visit https://accounts.google.com/o/oauth2/auth?client_id=test-id to continue');
    currentFakeProc.emit('close', 0);
    setTimeout(() => {
      expect(extractedUrl).toContain('https://accounts.google.com');
      expect(extractedUrl).toContain('client_id=test-id');
      done();
    }, 20);
  });

  test('executeAuth onData: "Waiting for authentication" does not log raw output', (done) => {
    const noop = () => undefined;
    const strategy = new GeminiStrategy(false);
    strategy.executeAuth({
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: () => done(),
      sendAuthStatus: noop,
      sendError: noop,
    });
    currentFakeProc.stdout.emit('data', 'Waiting for authentication...');
    // Auth URL should not be extracted from this output
    currentFakeProc.emit('close', 0);
  });
});

