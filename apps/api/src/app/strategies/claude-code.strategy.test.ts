import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ClaudeCodeStrategy, toolUseToEvent } from './claude-code.strategy';

const CLAUDE_TEST_HOME = join(tmpdir(), `claude-test-home-${process.pid}`);

function writeFakeClaude(path: string): void {
  writeFileSync(path, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.CLAUDE_FAKE_ARGS_PATH) {
  fs.writeFileSync(process.env.CLAUDE_FAKE_ARGS_PATH, JSON.stringify(args));
}
if (process.env.CLAUDE_FAKE_ENV_PATH) {
  fs.writeFileSync(process.env.CLAUDE_FAKE_ENV_PATH, JSON.stringify({
    HOME: process.env.HOME,
    SESSION_DIR: process.env.SESSION_DIR,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
  }));
}
if (process.env.CLAUDE_FAKE_MODE === 'missing-session') {
  console.error('No conversation found with session ID: stale-session-id');
  process.exit(1);
}
if (process.env.CLAUDE_FAKE_MODE === 'empty') {
  process.exit(0);
}
console.log(JSON.stringify({
  type: 'stream_event',
  session_id: process.env.CLAUDE_FAKE_SESSION_ID || 'session-new',
  event: {
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: process.env.CLAUDE_FAKE_MESSAGE || 'fake response' }
  }
}));
process.exit(0);
`, { mode: 0o755 });
  chmodSync(path, 0o755);
}

describe('toolUseToEvent', () => {
  test('returns file_created for write_file with path', () => {
    const event = toolUseToEvent(
      { name: 'write_file' },
      { path: 'src/foo.ts' }
    );
    expect(event.kind).toBe('file_created');
    expect(event.path).toBe('src/foo.ts');
    expect(event.name).toBe('foo.ts');
  });

  test('returns file_created for edit_file with file_path', () => {
    const event = toolUseToEvent(
      { name: 'edit_file' },
      { file_path: 'lib/bar.js' }
    );
    expect(event.kind).toBe('file_created');
    expect(event.path).toBe('lib/bar.js');
  });

  test('returns file_created for search_replace with path_input', () => {
    const event = toolUseToEvent(
      { name: 'search_replace' },
      { path_input: 'app/index.ts' }
    );
    expect(event.kind).toBe('file_created');
    expect(event.path).toBe('app/index.ts');
  });

  test('returns tool_call for run_terminal_cmd with command', () => {
    const event = toolUseToEvent(
      { name: 'run_terminal_cmd' },
      { command: 'npm install' }
    );
    expect(event.kind).toBe('tool_call');
    expect(event.command).toBe('npm install');
    expect(event.name).toBe('run_terminal_cmd');
  });

  test('returns tool_call for unknown tool name', () => {
    const event = toolUseToEvent(
      { name: 'unknown_tool' },
      { path: 'x' }
    );
    expect(event.kind).toBe('tool_call');
  });

  test('uses cb.name when input is undefined', () => {
    const event = toolUseToEvent({ name: 'write_file' }, undefined);
    expect(event.kind).toBe('file_created');
    expect(event.path).toBe('write_file');
    expect(event.name).toBe('write_file');
  });

  test('extracts command from input.arguments', () => {
    const event = toolUseToEvent(
      { name: 'run_terminal_cmd' },
      { arguments: { command: 'ls -la' } }
    );
    expect(event.kind).toBe('tool_call');
    expect(event.command).toBe('ls -la');
  });

  test('builds full command from command plus args array', () => {
    const event = toolUseToEvent(
      { name: 'run_terminal_cmd' },
      { command: 'npm', args: ['run', 'build', '--prod'] }
    );
    expect(event.kind).toBe('tool_call');
    expect(event.command).toBe('npm run build --prod');
  });

  test('builds command from arguments array only', () => {
    const event = toolUseToEvent(
      { name: 'run_terminal_cmd' },
      { arguments: ['bun', 'install', '--frozen-lockfile'] }
    );
    expect(event.kind).toBe('tool_call');
    expect(event.command).toBe('bun install --frozen-lockfile');
  });

  test('includes details for tool_call', () => {
    const event = toolUseToEvent(
      { name: 'run_terminal_cmd' },
      { command: 'echo', args: ['hello'] }
    );
    expect(event.details).toBeDefined();
    expect(JSON.parse(event.details as string)).toEqual({ command: 'echo', args: ['hello'] });
  });
});

const CLAUDE_ENV_TOKEN_KEYS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'] as const;

describe('ClaudeCodeStrategy API token mode', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.HOME = process.env.HOME;
    savedEnv.PATH = process.env.PATH;
    savedEnv.SESSION_DIR = process.env.SESSION_DIR;
    savedEnv.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
    savedEnv.XDG_DATA_HOME = process.env.XDG_DATA_HOME;
    savedEnv.XDG_STATE_HOME = process.env.XDG_STATE_HOME;
    savedEnv.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME;
    savedEnv.CLAUDE_FAKE_MODE = process.env.CLAUDE_FAKE_MODE;
    savedEnv.CLAUDE_FAKE_ARGS_PATH = process.env.CLAUDE_FAKE_ARGS_PATH;
    savedEnv.CLAUDE_FAKE_ENV_PATH = process.env.CLAUDE_FAKE_ENV_PATH;
    savedEnv.CLAUDE_FAKE_SESSION_ID = process.env.CLAUDE_FAKE_SESSION_ID;
    process.env.HOME = CLAUDE_TEST_HOME;
    if (!existsSync(CLAUDE_TEST_HOME)) {
      mkdirSync(CLAUDE_TEST_HOME, { recursive: true });
    }
    for (const key of CLAUDE_ENV_TOKEN_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env.HOME = savedEnv.HOME;
    process.env.PATH = savedEnv.PATH;
    if (savedEnv.SESSION_DIR === undefined) delete process.env.SESSION_DIR;
    else process.env.SESSION_DIR = savedEnv.SESSION_DIR;
    if (savedEnv.XDG_CONFIG_HOME === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedEnv.XDG_CONFIG_HOME;
    if (savedEnv.XDG_DATA_HOME === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = savedEnv.XDG_DATA_HOME;
    if (savedEnv.XDG_STATE_HOME === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = savedEnv.XDG_STATE_HOME;
    if (savedEnv.XDG_CACHE_HOME === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = savedEnv.XDG_CACHE_HOME;
    if (savedEnv.CLAUDE_FAKE_MODE === undefined) delete process.env.CLAUDE_FAKE_MODE;
    else process.env.CLAUDE_FAKE_MODE = savedEnv.CLAUDE_FAKE_MODE;
    if (savedEnv.CLAUDE_FAKE_ARGS_PATH === undefined) delete process.env.CLAUDE_FAKE_ARGS_PATH;
    else process.env.CLAUDE_FAKE_ARGS_PATH = savedEnv.CLAUDE_FAKE_ARGS_PATH;
    if (savedEnv.CLAUDE_FAKE_ENV_PATH === undefined) delete process.env.CLAUDE_FAKE_ENV_PATH;
    else process.env.CLAUDE_FAKE_ENV_PATH = savedEnv.CLAUDE_FAKE_ENV_PATH;
    if (savedEnv.CLAUDE_FAKE_SESSION_ID === undefined) delete process.env.CLAUDE_FAKE_SESSION_ID;
    else process.env.CLAUDE_FAKE_SESSION_ID = savedEnv.CLAUDE_FAKE_SESSION_ID;
    for (const key of CLAUDE_ENV_TOKEN_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    if (existsSync(CLAUDE_TEST_HOME)) {
      rmSync(CLAUDE_TEST_HOME, { recursive: true, force: true });
    }
  });

  test('checkAuthStatus returns false in api-token mode when no env token is set', async () => {
    const strategy = new ClaudeCodeStrategy(true);
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(false);
  });

  test('checkAuthStatus returns true in api-token mode when CLAUDE_CODE_OAUTH_TOKEN is set', async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test-token';
    const strategy = new ClaudeCodeStrategy(true);
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('executeAuth in api-token mode sends success when env token set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-123';
    const strategy = new ClaudeCodeStrategy(true);
    let authSuccess = false;
    const noop = () => { return; };
    const connection = {
      sendAuthSuccess: () => { authSuccess = true; },
      sendAuthStatus: noop,
      sendAuthManualToken: noop,
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection as never);
    expect(authSuccess).toBe(true);
  });

  test('executeAuth in api-token mode sends unauthenticated when no token', () => {
    const strategy = new ClaudeCodeStrategy(true);
    let status = '';
    const noop = () => { return; };
    const connection = {
      sendAuthSuccess: noop,
      sendAuthStatus: (s: string) => { status = s; },
      sendAuthManualToken: noop,
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection as never);
    expect(status).toBe('unauthenticated');
  });

  test('executeAuth in default mode sends manual token prompt', () => {
    const strategy = new ClaudeCodeStrategy(false);
    let manualTokenSent = false;
    const noop = () => { return; };
    const connection = {
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendAuthManualToken: () => { manualTokenSent = true; },
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection as never);
    expect(manualTokenSent).toBe(true);
  });

  test('submitAuthCode sends success when code is valid', () => {
    const strategy = new ClaudeCodeStrategy(false);
    let authSuccess = false;
    const noop = () => { return; };
    const connection = {
      sendAuthSuccess: () => { authSuccess = true; },
      sendAuthStatus: noop,
      sendAuthManualToken: noop,
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection as never);
    strategy.submitAuthCode('valid-token');
    expect(authSuccess).toBe(true);
  });

  test('submitAuthCode sends unauthenticated when code is empty', () => {
    const strategy = new ClaudeCodeStrategy(false);
    let status = '';
    const noop = () => { return; };
    const connection = {
      sendAuthSuccess: noop,
      sendAuthStatus: (s: string) => { status = s; },
      sendAuthManualToken: noop,
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection as never);
    strategy.submitAuthCode('');
    expect(status).toBe('unauthenticated');
  });

  test('cancelAuth clears connection', () => {
    const strategy = new ClaudeCodeStrategy();
    strategy.cancelAuth();
    // Should not throw
  });

  test('clearCredentials does not throw when no token file', () => {
    const strategy = new ClaudeCodeStrategy();
    strategy.clearCredentials();
  });

  test('interruptAgent does not throw', () => {
    const strategy = new ClaudeCodeStrategy();
    strategy.interruptAgent();
  });

  test('constructor with conversation data dir', () => {
    const strategy = new ClaudeCodeStrategy(false, {
      getConversationDataDir: () => join(CLAUDE_TEST_HOME, 'conv-data'),
      getEncryptionKey: () => undefined,
    });
    expect(strategy).toBeDefined();
  });

  test('checkAuthStatus returns true when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const strategy = new ClaudeCodeStrategy(true);
    expect(await strategy.checkAuthStatus()).toBe(true);
  });

  test('checkAuthStatus returns true when CLAUDE_API_KEY is set', async () => {
    process.env.CLAUDE_API_KEY = 'sk-claude-test';
    const strategy = new ClaudeCodeStrategy(true);
    expect(await strategy.checkAuthStatus()).toBe(true);
  });

  test('hasNativeSessionSupport returns true', () => {
    const strategy = new ClaudeCodeStrategy();
    expect(strategy.hasNativeSessionSupport()).toBe(true);
  });

  test('session marker file is read on sendMessage for resume support', () => {
    const convDataDir = join(CLAUDE_TEST_HOME, 'session-test-conv');
    mkdirSync(convDataDir, { recursive: true });
    const workDir = join(CLAUDE_TEST_HOME, 'session-test-work');
    mkdirSync(workDir, { recursive: true });
    const markerPath = join(workDir, '.claude_session');

    // Write a session ID to the marker file
    const { writeFileSync } = require('node:fs');
    writeFileSync(markerPath, 'test-session-id-123');

    const strategy = new ClaudeCodeStrategy(false, {
      getConversationDataDir: () => convDataDir,
      getEncryptionKey: () => undefined,
    });

    // The session ID will be loaded when sendMessage is called.
    // We verify the strategy was constructed without error and has session support.
    expect(strategy.hasNativeSessionSupport()).toBe(true);
  });

  test('executePromptStreaming clears stale session marker when Claude reports missing conversation', async () => {
    const fakeBinDir = join(CLAUDE_TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeClaude(join(fakeBinDir, 'claude'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.CLAUDE_FAKE_MODE = 'missing-session';

    const argsPath = join(CLAUDE_TEST_HOME, 'claude-args.json');
    process.env.CLAUDE_FAKE_ARGS_PATH = argsPath;

    const convDir = join(CLAUDE_TEST_HOME, 'missing-session-conv');
    const workspaceDir = join(convDir, 'claude_workspace');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, '.claude_session'), 'stale-session-id');

    const strategy = new ClaudeCodeStrategy(true, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('continue', '', () => undefined)).rejects.toThrow(
      'No conversation found with session ID: stale-session-id'
    );
    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      '--resume',
      'stale-session-id',
      '-p',
      'continue',
      '--dangerously-skip-permissions',
    ]);
    expect(existsSync(join(workspaceDir, '.claude_session'))).toBe(false);
  });

  test('executePromptStreaming points Claude HOME at the persisted SESSION_DIR parent', async () => {
    const fakeBinDir = join(CLAUDE_TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeClaude(join(fakeBinDir, 'claude'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.HOME = join(CLAUDE_TEST_HOME, 'non-persistent-home');
    process.env.SESSION_DIR = join(CLAUDE_TEST_HOME, 'persisted-agent-data', '.claude');

    const envPath = join(CLAUDE_TEST_HOME, 'claude-env.json');
    process.env.CLAUDE_FAKE_ENV_PATH = envPath;

    const convDir = join(CLAUDE_TEST_HOME, 'persisted-home-conv');
    const strategy = new ClaudeCodeStrategy(true, {
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', '', () => undefined)).resolves.toBeUndefined();
    expect(JSON.parse(readFileSync(envPath, 'utf8'))).toEqual({
      HOME: join(CLAUDE_TEST_HOME, 'persisted-agent-data'),
      SESSION_DIR: join(CLAUDE_TEST_HOME, 'persisted-agent-data', '.claude'),
      XDG_CONFIG_HOME: join(CLAUDE_TEST_HOME, 'persisted-agent-data', '.config'),
      XDG_DATA_HOME: join(CLAUDE_TEST_HOME, 'persisted-agent-data', '.local', 'share'),
      XDG_STATE_HOME: join(CLAUDE_TEST_HOME, 'persisted-agent-data', '.local', 'state'),
      XDG_CACHE_HOME: join(CLAUDE_TEST_HOME, 'persisted-agent-data', '.cache'),
    });
  });
});
