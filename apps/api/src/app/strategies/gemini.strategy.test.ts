import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GeminiStrategy, buildGeminiArgs } from './gemini.strategy';

function writeFakeGemini(path: string): void {
  writeFileSync(path, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.GEMINI_FAKE_ARGS_PATH) {
  fs.writeFileSync(process.env.GEMINI_FAKE_ARGS_PATH, JSON.stringify(args));
}
if (process.env.GEMINI_FAKE_MODE === 'missing-session') {
  console.error('No conversation found with session ID: stale-gemini-session');
  process.exit(1);
}
if (process.env.GEMINI_FAKE_MODE === 'empty') {
  process.exit(0);
}
console.log(process.env.GEMINI_FAKE_MESSAGE || 'fake response');
`, { mode: 0o755 });
  chmodSync(path, 0o755);
}

describe('GeminiStrategy API token mode', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (savedEnv.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedEnv.GEMINI_API_KEY;
  });

  test('checkAuthStatus returns false when GEMINI_API_KEY is not set in api-token mode', async () => {
    const strategy = new GeminiStrategy(true);
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(false);
  });

  test('checkAuthStatus returns true when GEMINI_API_KEY is set in api-token mode', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('executeAuth sends authSuccess when GEMINI_API_KEY is set in api-token mode', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    let successCalled = false;
    const noop = () => {
      return;
    };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: () => {
        successCalled = true;
      },
      sendAuthStatus: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection);
    expect(successCalled).toBe(true);
  });

  test('executeAuth sends sendAuthManualToken when GEMINI_API_KEY is missing in api-token mode', () => {
    const strategy = new GeminiStrategy(true);
    let manualTokenCalled = false;
    const noop = () => {
      return;
    };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: () => {
        manualTokenCalled = true;
      },
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection);
    expect(manualTokenCalled).toBe(true);
  });

  test('submitAuthCode in api-token mode stores token and sends authSuccess', async () => {
    const strategy = new GeminiStrategy(true);
    let successCalled = false;
    const noop = () => {
      return;
    };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: () => {
        successCalled = true;
      },
      sendAuthStatus: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection);
    strategy.submitAuthCode('stored-key');
    expect(successCalled).toBe(true);
    const status = await strategy.checkAuthStatus();
    expect(status).toBe(true);
  });

  test('checkAuthStatus returns true in api-token mode when only _apiToken is set', async () => {
    const strategy = new GeminiStrategy(true);
    const noop = () => {
      return;
    };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection);
    strategy.submitAuthCode('pastede-key');
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('submitAuthCode with empty string sends unauthenticated', () => {
    const strategy = new GeminiStrategy(true);
    let status = '';
    const noop = () => { return; };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: (s: string) => { status = s; },
      sendError: noop,
    };
    strategy.executeAuth(connection);
    strategy.submitAuthCode('');
    expect(status).toBe('unauthenticated');
  });

  test('cancelAuth clears state safely', () => {
    const strategy = new GeminiStrategy(true);
    strategy.cancelAuth();
    // Should not throw
  });

  test('clearCredentials is safe when no credentials exist', () => {
    const strategy = new GeminiStrategy(true);
    strategy.clearCredentials();
    // Should not throw
  });

  test('getModelArgs returns flags for valid model', () => {
    const strategy = new GeminiStrategy(true);
    expect(strategy.getModelArgs('gemini-2.5-pro')).toEqual(['-m', 'gemini-2.5-pro']);
  });

  test('getModelArgs returns empty array for empty model', () => {
    const strategy = new GeminiStrategy(true);
    expect(strategy.getModelArgs('')).toEqual([]);
  });

  test('getModelArgs returns empty for undefined model', () => {
    const strategy = new GeminiStrategy(true);
    expect(strategy.getModelArgs('undefined')).toEqual([]);
  });

  test('interruptAgent does not throw', () => {
    const strategy = new GeminiStrategy(true);
    strategy.interruptAgent();
  });

  test('constructor with conversationDataDir', () => {
    const strategy = new GeminiStrategy(false, {
      getConversationDataDir: () => '/tmp/test-conv',
      getEncryptionKey: () => undefined,
    });
    expect(strategy).toBeDefined();
  });

  test('executeLogout in api-token mode clears credentials immediately', () => {
    const strategy = new GeminiStrategy(true);
    let logoutSuccessCalled = false;
    const noop = () => { return; };
    const connection = {
      sendLogoutOutput: noop,
      sendLogoutSuccess: () => { logoutSuccessCalled = true; },
      sendError: noop,
    };
    strategy.executeLogout(connection);
    expect(logoutSuccessCalled).toBe(true);
  });
});

describe('buildGeminiArgs', () => {
  test('passes the prompt via the -p=value equals form so yargs binds it to -p', () => {
    const args = buildGeminiArgs('hello world', 'gemini-2.5-pro', false);
    expect(args).toEqual(['-m', 'gemini-2.5-pro', '--yolo', '-p=hello world']);
  });

  test('keeps -p bound to the value when the prompt starts with a dash (markdown bullet)', () => {
    const dashPrompt = '- bullet from system prompt\n[SYSCHECK]';
    const args = buildGeminiArgs(dashPrompt, 'gemini-2.5-pro', false);
    const promptArg = args.find((a) => a.startsWith('-p='));
    expect(promptArg).toBeDefined();
    expect(promptArg).toBe(`-p=${dashPrompt}`);
    expect(args).not.toContain('-p');
  });

  test('includes --resume when hasSession is true', () => {
    const args = buildGeminiArgs('continue', 'gemini-2.5-pro', true);
    expect(args).toContain('--resume');
    expect(args.find((a) => a.startsWith('-p='))).toBe('-p=continue');
  });

  test('omits -m when model is empty or the literal string "undefined"', () => {
    expect(buildGeminiArgs('hi', '', false)).toEqual(['--yolo', '-p=hi']);
    expect(buildGeminiArgs('hi', 'undefined', false)).toEqual(['--yolo', '-p=hi']);
  });
});
describe('GeminiStrategy session recovery', () => {
  let testHome = '';
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.PATH = process.env.PATH;
    savedEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    savedEnv.GEMINI_FAKE_ARGS_PATH = process.env.GEMINI_FAKE_ARGS_PATH;
    savedEnv.GEMINI_FAKE_MODE = process.env.GEMINI_FAKE_MODE;
    savedEnv.GEMINI_FAKE_MESSAGE = process.env.GEMINI_FAKE_MESSAGE;

    testHome = mkdtempSync(join(tmpdir(), 'gemini-strategy-test-'));
    const fakeBinDir = join(testHome, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeGemini(join(fakeBinDir, 'gemini'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_FAKE_ARGS_PATH;
    delete process.env.GEMINI_FAKE_MODE;
    delete process.env.GEMINI_FAKE_MESSAGE;
  });

  afterEach(() => {
    if (savedEnv.PATH === undefined) delete process.env.PATH;
    else process.env.PATH = savedEnv.PATH;
    if (savedEnv.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedEnv.GEMINI_API_KEY;
    if (savedEnv.GEMINI_FAKE_ARGS_PATH === undefined) delete process.env.GEMINI_FAKE_ARGS_PATH;
    else process.env.GEMINI_FAKE_ARGS_PATH = savedEnv.GEMINI_FAKE_ARGS_PATH;
    if (savedEnv.GEMINI_FAKE_MODE === undefined) delete process.env.GEMINI_FAKE_MODE;
    else process.env.GEMINI_FAKE_MODE = savedEnv.GEMINI_FAKE_MODE;
    if (savedEnv.GEMINI_FAKE_MESSAGE === undefined) delete process.env.GEMINI_FAKE_MESSAGE;
    else process.env.GEMINI_FAKE_MESSAGE = savedEnv.GEMINI_FAKE_MESSAGE;
    rmSync(testHome, { recursive: true, force: true });
  });

  test('executePromptStreaming clears stale session marker when Gemini reports missing conversation', async () => {
    const argsPath = join(testHome, 'gemini-args.json');
    process.env.GEMINI_FAKE_ARGS_PATH = argsPath;
    process.env.GEMINI_FAKE_MODE = 'missing-session';

    const convDir = join(testHome, 'missing-session-conv');
    const workspaceDir = join(convDir, 'gemini_workspace');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, '.gemini_session'), '');

    const strategy = new GeminiStrategy(true, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('continue', 'gemini-2.5-pro', () => undefined)).rejects.toThrow(
      'No conversation found with session ID: stale-gemini-session'
    );
    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      '-m',
      'gemini-2.5-pro',
      '--resume',
      '--yolo',
      '-p=continue',
    ]);
    expect(existsSync(join(workspaceDir, '.gemini_session'))).toBe(false);
  });
});
