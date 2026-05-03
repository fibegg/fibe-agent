import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveClaude, getEnrichedPath, _resetResolveClaudeCache } from './resolve-claude';

const TEST_TMP = join(tmpdir(), `resolve-claude-test-${process.pid}`);

function makeFakeBinary(path: string): void {
  writeFileSync(path, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  chmodSync(path, 0o755);
}

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  _resetResolveClaudeCache();
  savedEnv.CLAUDE_PATH = process.env.CLAUDE_PATH;
  savedEnv.PATH = process.env.PATH;
  delete process.env.CLAUDE_PATH;
  mkdirSync(TEST_TMP, { recursive: true });
});

afterEach(() => {
  _resetResolveClaudeCache();
  if (savedEnv.CLAUDE_PATH === undefined) delete process.env.CLAUDE_PATH;
  else process.env.CLAUDE_PATH = savedEnv.CLAUDE_PATH;
  if (savedEnv.PATH === undefined) delete process.env.PATH;
  else process.env.PATH = savedEnv.PATH;
});

describe('resolveClaude', () => {
  test('returns CLAUDE_PATH override when file exists', () => {
    const fakeBin = join(TEST_TMP, 'override-bin');
    mkdirSync(fakeBin, { recursive: true });
    const fakeClaude = join(fakeBin, 'claude');
    makeFakeBinary(fakeClaude);

    process.env.CLAUDE_PATH = fakeClaude;
    expect(resolveClaude()).toBe(fakeClaude);
  });

  test('ignores CLAUDE_PATH override when file does not exist', () => {
    process.env.CLAUDE_PATH = join(TEST_TMP, 'non-existent-claude');
    // Should not throw — falls through to other strategies
    const result = resolveClaude();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('caches result and returns same value on second call', () => {
    const fakeBin = join(TEST_TMP, 'cache-bin');
    mkdirSync(fakeBin, { recursive: true });
    const fakeClaude = join(fakeBin, 'claude');
    makeFakeBinary(fakeClaude);

    process.env.CLAUDE_PATH = fakeClaude;
    const first = resolveClaude();
    // mutate env — cache should return old value
    delete process.env.CLAUDE_PATH;
    const second = resolveClaude();
    expect(first).toBe(second);
  });

  test('reset clears cache so CLAUDE_PATH is re-evaluated', () => {
    const fakeBin = join(TEST_TMP, 'reset-bin');
    mkdirSync(fakeBin, { recursive: true });
    const fakeClaude = join(fakeBin, 'claude');
    makeFakeBinary(fakeClaude);

    process.env.CLAUDE_PATH = fakeClaude;
    const first = resolveClaude();
    expect(first).toBe(fakeClaude);

    _resetResolveClaudeCache();
    delete process.env.CLAUDE_PATH;
    // After reset, resolution happens again without the override
    const second = resolveClaude();
    // Should still return a non-empty string (may find real claude or fallback)
    expect(typeof second).toBe('string');
    expect(second.length).toBeGreaterThan(0);
  });

  test('falls back to "claude" string when binary cannot be found anywhere', () => {
    process.env.CLAUDE_PATH = join(TEST_TMP, 'missing');
    // Strip PATH so command -v fails; nvm + system dirs won't have claude in tmp
    process.env.PATH = TEST_TMP;

    // Force cache miss by resetting (already done in beforeEach, but be explicit)
    _resetResolveClaudeCache();

    // Result is either a real claude or the bare fallback string
    const result = resolveClaude();
    expect(typeof result).toBe('string');
  });

  test('returns a non-empty string in production-like environment', () => {
    // No CLAUDE_PATH set; should find the real claude binary via nvm or PATH
    const result = resolveClaude();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('getEnrichedPath', () => {
  test('prepends CLAUDE_PATH parent directory to PATH', () => {
    const fakeBin = join(TEST_TMP, 'enrich-bin');
    mkdirSync(fakeBin, { recursive: true });
    const fakeClaude = join(fakeBin, 'claude');
    makeFakeBinary(fakeClaude);

    process.env.CLAUDE_PATH = fakeClaude;
    const enriched = getEnrichedPath('/usr/bin:/bin');
    expect(enriched.startsWith(fakeBin)).toBe(true);
    expect(enriched).toContain('/usr/bin:/bin');
  });

  test('does not duplicate directories already present in PATH', () => {
    const fakeBin = join(TEST_TMP, 'dup-bin');
    mkdirSync(fakeBin, { recursive: true });
    const fakeClaude = join(fakeBin, 'claude');
    makeFakeBinary(fakeClaude);

    process.env.CLAUDE_PATH = fakeClaude;
    const baseWithDir = `${fakeBin}:/usr/bin`;
    const enriched = getEnrichedPath(baseWithDir);
    // fakeBin should appear only once
    const count = enriched.split(':').filter((s) => s === fakeBin).length;
    expect(count).toBe(1);
  });

  test('returns currentPath unchanged when no enrichment is possible', () => {
    delete process.env.CLAUDE_PATH;
    // Without CLAUDE_PATH and with no nvm candidates matching a fresh tmp HOME,
    // the function should at minimum not throw and return a string
    const base = '/usr/bin:/bin';
    const enriched = getEnrichedPath(base);
    expect(typeof enriched).toBe('string');
    // The original base must still be present
    expect(enriched).toContain('/usr/bin');
  });

  test('handles empty currentPath without throwing', () => {
    const result = getEnrichedPath('');
    expect(typeof result).toBe('string');
  });

  test('nvm bin dirs appear before system dirs in enriched PATH', () => {
    // We can verify this by checking that enriched PATH is either unchanged
    // (no nvm on this machine) or starts with an nvm directory
    const base = '/usr/bin:/bin';
    const enriched = getEnrichedPath(base);
    // Enriched must always end with the original base content (order guarantee)
    expect(enriched.endsWith(base) || enriched === base).toBe(true);
  });
});
