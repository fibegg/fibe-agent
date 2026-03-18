import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OpenaiCodexStrategy } from './openai-codex.strategy';

const TEST_HOME = join(tmpdir(), `codex-test-home-${process.pid}`);

describe('OpenaiCodexStrategy', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.HOME = process.env.HOME;
    savedEnv.SESSION_DIR = process.env.SESSION_DIR;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    process.env.HOME = TEST_HOME;
    process.env.SESSION_DIR = join(TEST_HOME, '.codex');
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = savedEnv.HOME;
    if (savedEnv.SESSION_DIR === undefined) delete process.env.SESSION_DIR;
    else process.env.SESSION_DIR = savedEnv.SESSION_DIR;
    if (savedEnv.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  test('ensureSettings creates Codex home directory when missing', () => {
    const codexDir = join(TEST_HOME, '.codex');
    expect(existsSync(codexDir)).toBe(false);
    const strategy = new OpenaiCodexStrategy();
    strategy.ensureSettings();
    expect(existsSync(codexDir)).toBe(true);
  });

  test('ensureSettings leaves directory unchanged when it exists', () => {
    const codexDir = join(TEST_HOME, '.codex');
    mkdirSync(codexDir, { recursive: true });
    const strategy = new OpenaiCodexStrategy();
    strategy.ensureSettings();
    expect(existsSync(codexDir)).toBe(true);
  });

  test('checkAuthStatus returns false when auth file does not exist', async () => {
    const strategy = new OpenaiCodexStrategy();
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(false);
  });

  test('checkAuthStatus returns true when auth.json has api_key', async () => {
    const codexDir = join(TEST_HOME, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, 'auth.json'), JSON.stringify({ api_key: 'sk-test' }), {
      mode: 0o600,
    });
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy();
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('checkAuthStatus returns true when auth.json has access_token', async () => {
    const codexDir = join(TEST_HOME, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, 'auth.json'), JSON.stringify({ access_token: 'tok' }), {
      mode: 0o600,
    });
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy();
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('checkAuthStatus returns false when auth.json is invalid JSON', async () => {
    const codexDir = join(TEST_HOME, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, 'auth.json'), 'not json', { mode: 0o600 });
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy();
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(false);
  });

  test('clearCredentials removes auth.json when present', () => {
    const codexDir = join(TEST_HOME, '.codex');
    mkdirSync(codexDir, { recursive: true });
    const authPath = join(codexDir, 'auth.json');
    writeFileSync(authPath, '{}', { mode: 0o600 });
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy();
    strategy.clearCredentials();
    expect(existsSync(authPath)).toBe(false);
  });

  test('clearCredentials is no-op when auth file does not exist', () => {
    process.env.SESSION_DIR = join(TEST_HOME, '.codex');
    const strategy = new OpenaiCodexStrategy();
    expect(() => strategy.clearCredentials()).not.toThrow();
  });

  test('checkAuthStatus returns true in api-token mode when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-token';
    const strategy = new OpenaiCodexStrategy(true);
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('ensureSettings in api-token mode writes auth.json when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-env-key';
    const codexDir = join(TEST_HOME, '.codex');
    process.env.SESSION_DIR = codexDir;
    const strategy = new OpenaiCodexStrategy(true);
    strategy.ensureSettings();
    expect(existsSync(join(codexDir, 'auth.json'))).toBe(true);
    const content = readFileSync(join(codexDir, 'auth.json'), 'utf8');
    expect(JSON.parse(content)).toEqual({ api_key: 'sk-env-key' });
  });

  test('ensureSettings in api-token mode does not write auth.json when OPENAI_API_KEY is empty', () => {
    delete process.env.OPENAI_API_KEY;
    const codexDir = join(TEST_HOME, '.codex');
    process.env.SESSION_DIR = codexDir;
    mkdirSync(codexDir, { recursive: true });
    const strategy = new OpenaiCodexStrategy(true);
    strategy.ensureSettings();
    expect(existsSync(join(codexDir, 'auth.json'))).toBe(false);
  });

  test('executeAuth in api-token mode sends authSuccess when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-ok';
    const strategy = new OpenaiCodexStrategy(true);
    let successCalled = false;
    const connection = {
      sendAuthUrlGenerated: () => {},
      sendDeviceCode: () => {},
      sendAuthManualToken: () => {},
      sendAuthSuccess: () => {
        successCalled = true;
      },
      sendAuthStatus: () => {},
      sendError: () => {},
    };
    strategy.executeAuth(connection);
    expect(successCalled).toBe(true);
  });
});
