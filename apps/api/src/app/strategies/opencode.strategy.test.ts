import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OpencodeStrategy, buildOpencodeRunArgs } from './opencode.strategy';
import type { AuthConnection, LogoutConnection } from './strategy.types';

const TEST_HOME = join(tmpdir(), `opencode-test-home-${process.pid}`);

function writeFakeOpencode(path: string): void {
  writeFileSync(path, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.OPENCODE_FAKE_ARGS_PATH) {
  fs.writeFileSync(process.env.OPENCODE_FAKE_ARGS_PATH, JSON.stringify(args));
}
if (process.env.OPENCODE_FAKE_MODE === 'missing-session') {
  console.error('No conversation found with session ID: stale-opencode-session');
  process.exit(1);
}
if (process.env.OPENCODE_FAKE_MODE === 'empty') {
  process.exit(0);
}
console.log(JSON.stringify({ type: 'text', part: { text: process.env.OPENCODE_FAKE_MESSAGE || 'fake response' } }));
`, { mode: 0o755 });
  chmodSync(path, 0o755);
}

describe('OpencodeStrategy', () => {
  let _oldHome: string | undefined;
  const savedEnv: Record<string, string | undefined> = {};

  // Keys we may set/clear during tests
  const envKeys = [
    'HOME',
    'PATH',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'OPENROUTER_API_KEY',
    'OPENAI_API_BASE',
    'OPENCODE_FAKE_ARGS_PATH',
    'OPENCODE_FAKE_MODE',
    'OPENCODE_FAKE_MESSAGE',
  ] as const;

  beforeEach(() => {
    for (const k of envKeys) savedEnv[k] = process.env[k];
    process.env.HOME = TEST_HOME;
    // Clear all API key env vars so tests start clean
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_BASE;
    delete process.env.OPENCODE_FAKE_ARGS_PATH;
    delete process.env.OPENCODE_FAKE_MODE;
    delete process.env.OPENCODE_FAKE_MESSAGE;
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  function makeConnection(): AuthConnection & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      sendAuthUrlGenerated: (url: string) => calls.push(`url:${url}`),
      sendDeviceCode: (code: string) => calls.push(`device:${code}`),
      sendAuthManualToken: () => calls.push('manual_token'),
      sendAuthSuccess: () => calls.push('auth_success'),
      sendAuthStatus: (status: string) => calls.push(`status:${status}`),
      sendError: (msg: string) => calls.push(`error:${msg}`),
    };
  }

  function makeLogoutConnection(): LogoutConnection & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      sendLogoutOutput: (text: string) => calls.push(`output:${text}`),
      sendLogoutSuccess: () => calls.push('logout_success'),
      sendError: (msg: string) => calls.push(`error:${msg}`),
    };
  }

  // ─── Auth modal behaviour ───────────────────────────────────────

  test('executeAuth shows manual token modal when no env key set', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('manual_token');
    expect(conn.calls).not.toContain('auth_success');
  });

  test('executeAuth skips modal when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('auth_success');
    expect(conn.calls).not.toContain('manual_token');
  });

  test('executeAuth skips modal when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('auth_success');
  });

  test('executeAuth skips modal when OPENROUTER_API_KEY is set', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('auth_success');
  });

  test('executeAuth skips modal when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('auth_success');
  });

  // ─── Manual key submission ──────────────────────────────────────

  test('submitAuthCode writes auth file and signals success', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('test-api-key-123');
    expect(conn.calls).toContain('auth_success');
    const authFile = join(TEST_HOME, '.local', 'share', 'opencode', 'auth.json');
    expect(existsSync(authFile)).toBe(true);
  });

  test('submitAuthCode with empty string sends unauthenticated', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('');
    expect(conn.calls).toContain('status:unauthenticated');
    expect(conn.calls).not.toContain('auth_success');
  });

  test('submitAuthCode with whitespace-only sends unauthenticated', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('   ');
    expect(conn.calls).toContain('status:unauthenticated');
  });

  // ─── checkAuthStatus ───────────────────────────────────────────

  test('checkAuthStatus returns false when no env key and no stored key', async () => {
    const strategy = new OpencodeStrategy();
    expect(await strategy.checkAuthStatus()).toBe(false);
  });

  test('checkAuthStatus returns true when ANTHROPIC_API_KEY env set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const strategy = new OpencodeStrategy();
    expect(await strategy.checkAuthStatus()).toBe(true);
  });

  test('checkAuthStatus returns true after submitAuthCode', async () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('my-key');
    expect(await strategy.checkAuthStatus()).toBe(true);
  });

  // ─── cancelAuth / clearCredentials / logout ─────────────────────

  test('cancelAuth prevents subsequent submitAuthCode from signaling', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.cancelAuth();
    strategy.submitAuthCode('key');
    expect(conn.calls).toEqual(['manual_token']);
  });

  test('clearCredentials removes auth file', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('my-key');
    const authFile = join(TEST_HOME, '.local', 'share', 'opencode', 'auth.json');
    expect(existsSync(authFile)).toBe(true);
    strategy.clearCredentials();
    expect(existsSync(authFile)).toBe(false);
  });

  test('executeLogout clears credentials and signals success', () => {
    const strategy = new OpencodeStrategy();
    const logoutConn = makeLogoutConnection();
    strategy.executeLogout(logoutConn);
    expect(logoutConn.calls).toContain('logout_success');
  });

  // ─── getModelArgs ──────────────────────────────────────────────

  test('getModelArgs returns --model flag without prefix when no OpenRouter key', () => {
    const strategy = new OpencodeStrategy();
    expect(strategy.getModelArgs('anthropic/claude-sonnet-4')).toEqual([
      '--model',
      'anthropic/claude-sonnet-4',
    ]);
  });

  test('getModelArgs auto-prefixes openrouter/ when OPENROUTER_API_KEY is set', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    expect(strategy.getModelArgs('openai/gpt-5.4')).toEqual([
      '--model',
      'openrouter/openai/gpt-5.4',
    ]);
  });

  test('getModelArgs does not double-prefix when model already has openrouter/', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    expect(strategy.getModelArgs('openrouter/openai/gpt-5.4')).toEqual([
      '--model',
      'openrouter/openai/gpt-5.4',
    ]);
  });

  test('getModelArgs returns empty array for empty model', () => {
    const strategy = new OpencodeStrategy();
    expect(strategy.getModelArgs('')).toEqual([]);
  });

  test('getModelArgs returns empty for undefined model', () => {
    const strategy = new OpencodeStrategy();
    expect(strategy.getModelArgs('undefined')).toEqual([]);
  });

  test('interruptAgent does not throw', () => {
    const strategy = new OpencodeStrategy();
    strategy.interruptAgent();
  });

  test('constructor with conversationDataDir', () => {
    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'conv-data'),
      getEncryptionKey: () => undefined,
    });
    expect(strategy).toBeDefined();
  });

  test('getModelArgs auto-prefixes when stored key is active', () => {
    // Submit a key to set stored key
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('test-openrouter-key');
    // Should auto-prefix because stored key is active and no env keys
    const args = strategy.getModelArgs('openai/gpt-5.4');
    expect(args).toEqual(['--model', 'openrouter/openai/gpt-5.4']);
  });

  test('clearCredentials is safe when no auth file exists', () => {
    const strategy = new OpencodeStrategy();
    strategy.clearCredentials();
  });

  test('executePromptStreaming clears stale session marker when OpenCode reports missing conversation', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const argsPath = join(TEST_HOME, 'opencode-args.json');
    process.env.OPENCODE_FAKE_ARGS_PATH = argsPath;
    process.env.OPENCODE_FAKE_MODE = 'missing-session';

    const convDir = join(TEST_HOME, 'missing-session-conv');
    const workspaceDir = join(convDir, 'opencode_workspace');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, '.opencode_session'), '');

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('continue', 'openai/gpt-5.4', () => undefined)).rejects.toThrow(
      'No conversation found with session ID: stale-opencode-session'
    );
    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      'run',
      '--continue',
      '--format',
      'json',
      '--thinking',
      '--model',
      'openai/gpt-5.4',
      '--',
      'continue',
    ]);
    expect(existsSync(join(workspaceDir, '.opencode_session'))).toBe(false);
  });
});

describe('buildOpencodeRunArgs', () => {
  test('places `--` immediately before the prompt so opencode treats it as a positional', () => {
    const args = buildOpencodeRunArgs('hello', ['--model', 'openai/gpt-5.4'], false);
    expect(args).toEqual([
      'run',
      '--format',
      'json',
      '--thinking',
      '--model',
      'openai/gpt-5.4',
      '--',
      'hello',
    ]);
  });

  test('still delimits the prompt with `--` when it starts with a dash (markdown bullet)', () => {
    const dashPrompt = '- bullet from system prompt\n[SYSCHECK]';
    const args = buildOpencodeRunArgs(dashPrompt, ['--model', 'openai/gpt-5.4'], false);
    const separatorIndex = args.indexOf('--');
    expect(separatorIndex).toBeGreaterThan(-1);
    expect(args[separatorIndex + 1]).toBe(dashPrompt);
    expect(args[args.length - 1]).toBe(dashPrompt);
  });

  test('includes --continue when hasSession is true', () => {
    const args = buildOpencodeRunArgs('hi', [], true);
    expect(args).toEqual(['run', '--continue', '--format', 'json', '--thinking', '--', 'hi']);
  });
});

describe('buildOpencodeRunArgs', () => {
  test('places `--` immediately before the prompt so opencode treats it as a positional', () => {
    const args = buildOpencodeRunArgs('hello', ['--model', 'openai/gpt-5.4'], false);
    expect(args).toEqual([
      'run',
      '--format',
      'json',
      '--thinking',
      '--model',
      'openai/gpt-5.4',
      '--',
      'hello',
    ]);
  });

  test('still delimits the prompt with `--` when it starts with a dash (markdown bullet)', () => {
    const dashPrompt = '- bullet from system prompt\n[SYSCHECK]';
    const args = buildOpencodeRunArgs(dashPrompt, ['--model', 'openai/gpt-5.4'], false);
    const separatorIndex = args.indexOf('--');
    expect(separatorIndex).toBeGreaterThan(-1);
    expect(args[separatorIndex + 1]).toBe(dashPrompt);
    expect(args[args.length - 1]).toBe(dashPrompt);
  });

  test('includes --continue when hasSession is true', () => {
    const args = buildOpencodeRunArgs('hi', [], true);
    expect(args).toEqual(['run', '--continue', '--format', 'json', '--thinking', '--', 'hi']);
  });
});
