import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRuntimeFiles } from './runtime-files-writer';

describe('writeRuntimeFiles', () => {
  const originalEnv = { ...process.env };
  let testHome: string;

  beforeEach(() => {
    testHome = join(tmpdir(), `runtime-files-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testHome, { recursive: true });
    process.env = { ...originalEnv };
    process.env.HOME = testHome;
    process.env.DATA_DIR = join(testHome, 'data');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    rmSync(testHome, { recursive: true, force: true });
  });

  test('returns 0 when AGENT_RUNTIME_FILES_JSON is not set', () => {
    delete process.env.AGENT_RUNTIME_FILES_JSON;
    expect(writeRuntimeFiles()).toBe(0);
  });

  test('deep-merges JSON runtime files', () => {
    const path = join(testHome, '.gemini', 'settings.json');
    mkdirSync(join(testHome, '.gemini'), { recursive: true });
    writeFileSync(path, JSON.stringify({ theme: 'dark', security: { old: true } }));
    process.env.AGENT_RUNTIME_FILES_JSON = JSON.stringify({
      version: 1,
      files: [
        {
          path,
          format: 'json',
          operation: 'deep_merge',
          content: { security: { auth: { selectedType: 'oauth-personal' } } },
          mode: '0600',
        },
      ],
    });

    expect(writeRuntimeFiles()).toBe(1);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.theme).toBe('dark');
    expect(written.security.old).toBe(true);
    expect(written.security.auth.selectedType).toBe('oauth-personal');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test('writes text runtime files only when missing', () => {
    const path = join(testHome, 'data', 'agent-1', 'opencode_workspace', 'opencode.json');
    process.env.AGENT_RUNTIME_FILES_JSON = JSON.stringify({
      version: 1,
      files: [
        {
          path,
          format: 'text',
          operation: 'write_if_missing',
          content: '{"permission":"allow"}',
          mode: '0644',
        },
      ],
    });

    expect(writeRuntimeFiles()).toBe(1);
    expect(readFileSync(path, 'utf8')).toBe('{"permission":"allow"}');
    expect(statSync(path).mode & 0o777).toBe(0o644);

    process.env.AGENT_RUNTIME_FILES_JSON = JSON.stringify({
      version: 1,
      files: [
        {
          path,
          format: 'text',
          operation: 'write_if_missing',
          content: '{"permission":"deny"}',
        },
      ],
    });

    expect(writeRuntimeFiles()).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe('{"permission":"allow"}');
  });

  test('ignores invalid JSON payloads', () => {
    process.env.AGENT_RUNTIME_FILES_JSON = 'not-json';
    expect(writeRuntimeFiles()).toBe(0);
  });

  test('skips unsafe paths outside allowed roots', () => {
    const outside = join(tmpdir(), `outside-${Date.now()}.json`);
    process.env.AGENT_RUNTIME_FILES_JSON = JSON.stringify({
      version: 1,
      files: [
        {
          path: outside,
          format: 'json',
          content: { unsafe: true },
        },
      ],
    });

    expect(writeRuntimeFiles()).toBe(0);
    expect(existsSync(outside)).toBe(false);
  });
});
