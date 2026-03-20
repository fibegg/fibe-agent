import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ClaudeCodeStrategy, toolUseToEvent } from './claude-code.strategy';

const CLAUDE_TEST_HOME = join(tmpdir(), `claude-test-home-${process.pid}`);

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
});
