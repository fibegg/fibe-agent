import { describe, test, expect } from 'bun:test';
import { loadGitignore } from './gitignore-utils';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('gitignore-utils', () => {
  let tempDir: string;

  const setup = (gitignoreContent: string) => {
    tempDir = mkdtempSync(join(tmpdir(), 'gitignore-test-'));
    writeFileSync(join(tempDir, '.gitignore'), gitignoreContent);
    return tempDir;
  };

  const cleanup = () => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  };

  test('ignores files matching simple patterns', async () => {
    const dir = setup('node_modules\n*.log\n');
    try {
      const filter = await loadGitignore(dir);
      expect(filter.ignores('node_modules')).toBe(true);
      expect(filter.ignores('error.log')).toBe(true);
      expect(filter.ignores('src/app.ts')).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('handles comments and blank lines', async () => {
    const dir = setup('# comment\n\nnode_modules\n');
    try {
      const filter = await loadGitignore(dir);
      expect(filter.ignores('node_modules')).toBe(true);
      expect(filter.ignores('# comment')).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('handles negation patterns', async () => {
    const dir = setup('*.log\n!important.log\n');
    try {
      const filter = await loadGitignore(dir);
      expect(filter.ignores('error.log')).toBe(true);
      expect(filter.ignores('important.log')).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('handles directory patterns ending with /', async () => {
    const dir = setup('build/\n');
    try {
      const filter = await loadGitignore(dir);
      expect(filter.ignores('build')).toBe(true);
      expect(filter.ignores('build/output.js')).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('handles path patterns with /', async () => {
    const dir = setup('src/generated\n');
    try {
      const filter = await loadGitignore(dir);
      expect(filter.ignores('src/generated')).toBe(true);
      expect(filter.ignores('other/generated')).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('returns empty filter when .gitignore does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-gitignore-'));
    try {
      const filter = await loadGitignore(dir);
      expect(filter.ignores('anything')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('combines with parent filter', async () => {
    const dir = setup('local-only\n');
    try {
      const parentFilter = { ignores: (p: string) => p === 'from-parent' };
      const filter = await loadGitignore(dir, parentFilter);
      expect(filter.ignores('from-parent')).toBe(true);
      expect(filter.ignores('local-only')).toBe(true);
      expect(filter.ignores('neither')).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('handles glob wildcards', async () => {
    const dir = setup('*.tmp\ntest-*\n');
    try {
      const filter = await loadGitignore(dir);
      expect(filter.ignores('file.tmp')).toBe(true);
      expect(filter.ignores('test-output')).toBe(true);
      expect(filter.ignores('file.ts')).toBe(false);
    } finally {
      cleanup();
    }
  });
});
