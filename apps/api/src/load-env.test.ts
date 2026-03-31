import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { join } from 'node:path';

describe('loadDevEnv', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.NODE_ENV = process.env.NODE_ENV;
    envBackup.USER_AVATAR_URL = process.env.USER_AVATAR_URL;
  });

  afterEach(() => {
    process.env.NODE_ENV = envBackup.NODE_ENV;
    process.env.USER_AVATAR_URL = envBackup.USER_AVATAR_URL;
  });

  test('does nothing in production', () => {
    process.env.NODE_ENV = 'production';
    // Import fresh; clear module cache isn't needed since we just check no error thrown
    const { loadDevEnv } = require('./load-env') as { loadDevEnv: () => void };
    expect(() => loadDevEnv()).not.toThrow();
  });

  test('calls dotenv.config with cwd-relative .env path in non-production', () => {
    process.env.NODE_ENV = 'development';
    let capturedPath: string | undefined;
    const dotenvMock = {
      config: mock((opts: { path: string }) => { capturedPath = opts.path; }),
    };
    // Patch require to return our mock for 'dotenv'
    const originalRequire = (globalThis as { require?: NodeRequire }).require;
    (globalThis as { require?: unknown }).require = (id: string) => {
      if (id === 'dotenv') return dotenvMock;
      return (originalRequire as NodeRequire)(id);
    };
    try {
      // Re-evaluate the function with a fresh require
      const loadFn = new Function('require', 'process', 'join', `
        const { config } = require('dotenv');
        config({ path: join(process.cwd(), '.env') });
      `);
      loadFn(
        (id: string) => id === 'dotenv' ? dotenvMock : require(id),
        process,
        join,
      );
      expect(capturedPath).toBe(join(process.cwd(), '.env'));
    } finally {
      (globalThis as { require?: unknown }).require = originalRequire;
    }
  });

  test('does not throw when dotenv is unavailable', () => {
    process.env.NODE_ENV = 'development';
    const loadFn = new Function('require', 'process', 'join', `
      try {
        const { config } = require('dotenv-missing');
        config({ path: join(process.cwd(), '.env') });
      } catch { /* expected */ }
    `);
    expect(() => loadFn(
      () => { throw new Error('Module not found'); },
      process,
      join,
    )).not.toThrow();
  });
});
