import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GeminiStrategy, buildGeminiArgs } from './gemini.strategy';

function writeFakeGemini(path: string): void {
  writeFileSync(path, `#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const args = process.argv.slice(2);
if (process.env.GEMINI_FAKE_ARGS_PATH) {
  fs.writeFileSync(process.env.GEMINI_FAKE_ARGS_PATH, JSON.stringify(args));
}
if (process.env.GEMINI_FAKE_ENV_PATH) {
  fs.writeFileSync(process.env.GEMINI_FAKE_ENV_PATH, JSON.stringify({
    GEMINI_CLI_HOME: process.env.GEMINI_CLI_HOME,
    NO_BROWSER: process.env.NO_BROWSER,
  }));
}
function geminiConfigDir() {
  if (process.env.SESSION_DIR) return process.env.SESSION_DIR;
  if (process.env.GEMINI_CLI_HOME) return path.join(process.env.GEMINI_CLI_HOME, '.gemini');
  return path.join(os.homedir(), '.gemini');
}
function sessionIdFromArgs() {
  const index = args.indexOf('--resume');
  if (index >= 0 && args[index + 1] && args[index + 1] !== 'latest') return args[index + 1];
  return process.env.GEMINI_FAKE_SESSION_ID || '11111111-2222-4333-8444-555555555555';
}
function promptFromArgs() {
  const promptArg = args.find((arg) => arg.startsWith('-p='));
  return promptArg ? promptArg.slice(3) : '';
}
function writeSessionFile() {
  if (process.env.GEMINI_FAKE_SKIP_SESSION_WRITE === '1') return;
  const sessionId = sessionIdFromArgs();
  const configDir = geminiConfigDir();
  const projectDir = path.join(configDir, 'tmp', 'gemini-workspace');
  const chatsDir = path.join(projectDir, 'chats');
  fs.mkdirSync(chatsDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.project_root'), path.resolve(process.cwd()));
  fs.writeFileSync(path.join(chatsDir, 'session-2026-05-04T08-00-' + sessionId.slice(0, 8) + '.json'), JSON.stringify({
    sessionId,
    projectHash: 'fake',
    startTime: '2026-05-04T08:00:00.000Z',
    lastUpdated: new Date().toISOString(),
    messages: [{ type: 'user', content: promptFromArgs() }, { type: 'gemini', content: 'fake response' }],
    kind: 'main'
  }, null, 2));
}
if (process.env.GEMINI_FAKE_MODE === 'missing-session') {
  console.error('No conversation found with session ID: stale-gemini-session');
  process.exit(1);
}
if (process.env.GEMINI_FAKE_MODE === 'empty') {
  process.exit(0);
}
writeSessionFile();
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
    const args = buildGeminiArgs('hello world', 'gemini-2.5-pro', null);
    expect(args).toEqual(['-m', 'gemini-2.5-pro', '-p=hello world', '--yolo']);
  });

  test('keeps -p bound to the value when the prompt starts with a dash (markdown bullet)', () => {
    const dashPrompt = '- bullet from system prompt\n[SYSCHECK]';
    const args = buildGeminiArgs(dashPrompt, 'gemini-2.5-pro', null);
    const promptArg = args.find((a) => a.startsWith('-p='));
    expect(promptArg).toBeDefined();
    expect(promptArg).toBe(`-p=${dashPrompt}`);
    expect(args).not.toContain('-p');
  });

  test('includes --resume when hasSession is true', () => {
    const args = buildGeminiArgs('continue', 'gemini-2.5-pro', '11111111-2222-4333-8444-555555555555');
    expect(args).toContain('--resume');
    expect(args).toContain('11111111-2222-4333-8444-555555555555');
    expect(args.find((a) => a.startsWith('-p='))).toBe('-p=continue');
  });

  test('omits -m when model is empty or the literal string "undefined"', () => {
    expect(buildGeminiArgs('hi', '', null)).toEqual(['-p=hi', '--yolo']);
    expect(buildGeminiArgs('hi', 'undefined', null)).toEqual(['-p=hi', '--yolo']);
  });
});
describe('GeminiStrategy session recovery', () => {
  let testHome = '';
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.PATH = process.env.PATH;
    savedEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    savedEnv.GEMINI_FAKE_ARGS_PATH = process.env.GEMINI_FAKE_ARGS_PATH;
    savedEnv.GEMINI_FAKE_ENV_PATH = process.env.GEMINI_FAKE_ENV_PATH;
    savedEnv.GEMINI_FAKE_MODE = process.env.GEMINI_FAKE_MODE;
    savedEnv.GEMINI_FAKE_MESSAGE = process.env.GEMINI_FAKE_MESSAGE;
    savedEnv.GEMINI_FAKE_SESSION_ID = process.env.GEMINI_FAKE_SESSION_ID;
    savedEnv.GEMINI_FAKE_SKIP_SESSION_WRITE = process.env.GEMINI_FAKE_SKIP_SESSION_WRITE;
    savedEnv.GEMINI_CLI_HOME = process.env.GEMINI_CLI_HOME;
    savedEnv.NO_BROWSER = process.env.NO_BROWSER;
    savedEnv.SESSION_DIR = process.env.SESSION_DIR;

    testHome = mkdtempSync(join(tmpdir(), 'gemini-strategy-test-'));
    const fakeBinDir = join(testHome, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeGemini(join(fakeBinDir, 'gemini'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_FAKE_ARGS_PATH;
    delete process.env.GEMINI_FAKE_ENV_PATH;
    delete process.env.GEMINI_FAKE_MODE;
    delete process.env.GEMINI_FAKE_MESSAGE;
    delete process.env.GEMINI_FAKE_SESSION_ID;
    delete process.env.GEMINI_FAKE_SKIP_SESSION_WRITE;
    delete process.env.GEMINI_CLI_HOME;
    delete process.env.NO_BROWSER;
    delete process.env.SESSION_DIR;
  });

  afterEach(() => {
    if (savedEnv.PATH === undefined) delete process.env.PATH;
    else process.env.PATH = savedEnv.PATH;
    if (savedEnv.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedEnv.GEMINI_API_KEY;
    if (savedEnv.GEMINI_FAKE_ARGS_PATH === undefined) delete process.env.GEMINI_FAKE_ARGS_PATH;
    else process.env.GEMINI_FAKE_ARGS_PATH = savedEnv.GEMINI_FAKE_ARGS_PATH;
    if (savedEnv.GEMINI_FAKE_ENV_PATH === undefined) delete process.env.GEMINI_FAKE_ENV_PATH;
    else process.env.GEMINI_FAKE_ENV_PATH = savedEnv.GEMINI_FAKE_ENV_PATH;
    if (savedEnv.GEMINI_FAKE_MODE === undefined) delete process.env.GEMINI_FAKE_MODE;
    else process.env.GEMINI_FAKE_MODE = savedEnv.GEMINI_FAKE_MODE;
    if (savedEnv.GEMINI_FAKE_MESSAGE === undefined) delete process.env.GEMINI_FAKE_MESSAGE;
    else process.env.GEMINI_FAKE_MESSAGE = savedEnv.GEMINI_FAKE_MESSAGE;
    if (savedEnv.GEMINI_FAKE_SESSION_ID === undefined) delete process.env.GEMINI_FAKE_SESSION_ID;
    else process.env.GEMINI_FAKE_SESSION_ID = savedEnv.GEMINI_FAKE_SESSION_ID;
    if (savedEnv.GEMINI_FAKE_SKIP_SESSION_WRITE === undefined) delete process.env.GEMINI_FAKE_SKIP_SESSION_WRITE;
    else process.env.GEMINI_FAKE_SKIP_SESSION_WRITE = savedEnv.GEMINI_FAKE_SKIP_SESSION_WRITE;
    if (savedEnv.GEMINI_CLI_HOME === undefined) delete process.env.GEMINI_CLI_HOME;
    else process.env.GEMINI_CLI_HOME = savedEnv.GEMINI_CLI_HOME;
    if (savedEnv.NO_BROWSER === undefined) delete process.env.NO_BROWSER;
    else process.env.NO_BROWSER = savedEnv.NO_BROWSER;
    if (savedEnv.SESSION_DIR === undefined) delete process.env.SESSION_DIR;
    else process.env.SESSION_DIR = savedEnv.SESSION_DIR;
    rmSync(testHome, { recursive: true, force: true });
  });

  test('executePromptStreaming clears stale session marker when Gemini reports missing conversation', async () => {
    const argsPath = join(testHome, 'gemini-args.json');
    process.env.GEMINI_FAKE_ARGS_PATH = argsPath;
    process.env.GEMINI_FAKE_MODE = 'missing-session';

    const convDir = join(testHome, 'missing-session-conv');
    mkdirSync(convDir, { recursive: true });
    writeFileSync(join(convDir, '.gemini_session'), 'stale-gemini-session');

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
      'stale-gemini-session',
      '-p=continue',
      '--yolo',
    ]);
    expect(existsSync(join(convDir, '.gemini_session'))).toBe(false);
  });

  test('executePromptStreaming stores Gemini session UUID per conversation and uses shared workspace', async () => {
    const argsPath = join(testHome, 'gemini-args.json');
    process.env.GEMINI_FAKE_ARGS_PATH = argsPath;
    process.env.GEMINI_CLI_HOME = join(testHome, 'gemini-home');
    process.env.GEMINI_FAKE_SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

    const defaultDir = join(testHome, 'agent-data');
    const convDir = join(defaultDir, 'conversations', 'chat-a');
    const strategy = new GeminiStrategy(true, {
      getConversationDataDir: () => convDir,
      getDefaultConversationDataDir: () => defaultDir,
      getConversationId: () => 'chat-a',
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', 'gemini-2.5-pro', () => undefined)).resolves.toBeUndefined();
    expect(strategy.getWorkingDir()).toBe(join(defaultDir, 'gemini_workspace'));
    expect(readFileSync(join(convDir, '.gemini_session'), 'utf8')).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      '-m',
      'gemini-2.5-pro',
      '-p=hello',
      '--yolo',
    ]);

    await expect(strategy.executePromptStreaming('again', 'gemini-2.5-pro', () => undefined)).resolves.toBeUndefined();
    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      '-m',
      'gemini-2.5-pro',
      '--resume',
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      '-p=again',
      '--yolo',
    ]);
  });

  test('new UUID conversations do not inherit a legacy workspace latest marker', async () => {
    const argsPath = join(testHome, 'gemini-legacy-marker-args.json');
    process.env.GEMINI_FAKE_ARGS_PATH = argsPath;
    process.env.GEMINI_CLI_HOME = join(testHome, 'gemini-home');

    const defaultDir = join(testHome, 'agent-data');
    const convDir = join(defaultDir, 'conversations', 'chat-b');
    const sharedWorkspace = join(defaultDir, 'gemini_workspace');
    mkdirSync(sharedWorkspace, { recursive: true });
    writeFileSync(join(sharedWorkspace, '.gemini_session'), '');

    const strategy = new GeminiStrategy(true, {
      getConversationDataDir: () => convDir,
      getDefaultConversationDataDir: () => defaultDir,
      getConversationId: () => 'chat-b',
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('fresh', 'gemini-2.5-pro', () => undefined)).resolves.toBeUndefined();
    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      '-m',
      'gemini-2.5-pro',
      '-p=fresh',
      '--yolo',
    ]);
  });

  test('steerAgent queues Gemini input for the next turn instead of interrupting', async () => {
    const argsPath = join(testHome, 'gemini-steer-args.json');
    process.env.GEMINI_FAKE_ARGS_PATH = argsPath;
    process.env.GEMINI_CLI_HOME = join(testHome, 'gemini-home');

    const strategy = new GeminiStrategy(true, {
      getConversationDataDir: () => join(testHome, 'steer-conv'),
      getDefaultConversationDataDir: () => join(testHome, 'agent-data'),
      getConversationId: () => 'steer-conv',
      getEncryptionKey: () => undefined,
    });

    strategy.steerAgent('operator note');
    await expect(strategy.executePromptStreaming('continue', 'gemini-2.5-pro', () => undefined)).resolves.toBeUndefined();
    const args = JSON.parse(readFileSync(argsPath, 'utf8')) as string[];
    expect(args.find((arg) => arg.startsWith('-p='))).toBe('-p=[Operator Interruption]\noperator note\n\ncontinue');
  });

  test('executePromptStreaming preserves Rails-provided Gemini env', async () => {
    const envPath = join(testHome, 'gemini-env.json');
    process.env.GEMINI_FAKE_ENV_PATH = envPath;
    process.env.GEMINI_CLI_HOME = join(testHome, 'fibe-gemini-home');
    process.env.NO_BROWSER = 'fibe-set';

    const strategy = new GeminiStrategy(true, {
      getConversationDataDir: () => join(testHome, 'fibe-env-conv'),
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', 'gemini-2.5-pro', () => undefined)).resolves.toBeUndefined();
    expect(JSON.parse(readFileSync(envPath, 'utf8'))).toEqual({
      GEMINI_CLI_HOME: join(testHome, 'fibe-gemini-home'),
      NO_BROWSER: 'fibe-set',
    });
  });

  test('executePromptStreaming keeps legacy Gemini env fallback from SESSION_DIR', async () => {
    const envPath = join(testHome, 'gemini-fallback-env.json');
    const sessionDir = join(testHome, 'agent-data', '.gemini');
    process.env.GEMINI_FAKE_ENV_PATH = envPath;
    process.env.SESSION_DIR = sessionDir;

    const strategy = new GeminiStrategy(true, {
      getConversationDataDir: () => join(testHome, 'fallback-env-conv'),
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', 'gemini-2.5-pro', () => undefined)).resolves.toBeUndefined();
    expect(JSON.parse(readFileSync(envPath, 'utf8'))).toEqual({
      GEMINI_CLI_HOME: join(testHome, 'agent-data'),
      NO_BROWSER: 'true',
    });
  });
});
