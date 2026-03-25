import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OpencodeStrategy } from './opencode.strategy';
import type { AuthConnection, LogoutConnection } from './strategy.types';

const TEST_HOME = join(tmpdir(), `opencode-test-home-${process.pid}`);

describe('OpencodeStrategy', () => {
  let _oldHome: string | undefined;
  const savedEnv: Record<string, string | undefined> = {};

  // Keys we may set/clear during tests
  const envKeys = [
    'HOME',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'OPENROUTER_API_KEY',
    'OPENAI_API_BASE',
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
});
