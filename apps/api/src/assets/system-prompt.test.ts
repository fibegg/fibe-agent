import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * These tests guard the integrity of the built-in system prompt asset and the
 * prompts/ library that ships alongside the source code.
 *
 * They are intentionally lightweight — they verify structure and essential
 * content rules so that accidental truncation or corruption of prompt files
 * is caught in CI before reaching production.
 */

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..');

/** Resolve a path relative to the monorepo root. */
const repo = (...parts: string[]) => join(REPO_ROOT, ...parts);

// ---------------------------------------------------------------------------
// Built-in fallback asset (bundled into Docker image)
// ---------------------------------------------------------------------------

describe('built-in SYSTEM_PROMPT.md asset', () => {
  const assetPath = join(import.meta.dir, 'SYSTEM_PROMPT.md');

  test('file exists', () => {
    expect(existsSync(assetPath)).toBe(true);
  });

  test('is non-empty', () => {
    const content = readFileSync(assetPath, 'utf8').trim();
    expect(content.length).toBeGreaterThan(0);
  });

  test('contains scope constraint', () => {
    const content = readFileSync(assetPath, 'utf8');
    expect(content).toContain('current directory');
  });

  test('mentions code playground context', () => {
    const content = readFileSync(assetPath, 'utf8');
    expect(content.toLowerCase()).toContain('code playground');
  });
});

// ---------------------------------------------------------------------------
// prompts/ library
// ---------------------------------------------------------------------------

describe('prompts/ library — README', () => {
  const readmePath = repo('prompts', 'README.md');

  test('README.md exists', () => {
    expect(existsSync(readmePath)).toBe(true);
  });

  test('README.md documents SYSTEM_PROMPT_PATH', () => {
    const content = readFileSync(readmePath, 'utf8');
    expect(content).toContain('SYSTEM_PROMPT_PATH');
  });
});

describe('prompts/ library — base prompts', () => {
  const basePrompts: { name: string; requiredPhrases: string[] }[] = [
    {
      name: 'code-playground.md',
      requiredPhrases: ['current working directory', 'Scope rules', 'Workflow', 'Code quality'],
    },
  ];

  for (const { name, requiredPhrases } of basePrompts) {
    const filePath = repo('prompts', 'base', name);

    describe(name, () => {
      test('file exists', () => {
        expect(existsSync(filePath)).toBe(true);
      });

      test('is non-empty', () => {
        const content = readFileSync(filePath, 'utf8').trim();
        expect(content.length).toBeGreaterThan(100);
      });

      for (const phrase of requiredPhrases) {
        test(`contains "${phrase}"`, () => {
          const content = readFileSync(filePath, 'utf8');
          expect(content).toContain(phrase);
        });
      }
    });
  }
});

describe('prompts/ library — provider prompts', () => {
  const providers = ['gemini', 'claude-code', 'openai-codex', 'opencode', 'cursor'];

  for (const provider of providers) {
    const filePath = repo('prompts', 'providers', `${provider}.md`);

    describe(`${provider}.md`, () => {
      test('file exists', () => {
        expect(existsSync(filePath)).toBe(true);
      });

      test('is non-empty', () => {
        const content = readFileSync(filePath, 'utf8').trim();
        expect(content.length).toBeGreaterThan(100);
      });

      test('contains scope constraint (work only inside current directory)', () => {
        const content = readFileSync(filePath, 'utf8');
        expect(content).toContain('current directory');
      });

      test('contains provider name in content', () => {
        const content = readFileSync(filePath, 'utf8').toLowerCase();
        // Each file should reference its own provider name (e.g. "gemini", "claude", "codex", "opencode")
        const keyword = provider === 'claude-code' ? 'claude' : provider === 'openai-codex' ? 'codex' : provider;
        expect(content).toContain(keyword);
      });

      test('mentions workflow', () => {
        const content = readFileSync(filePath, 'utf8');
        expect(content).toContain('Workflow');
      });
    });
  }
});
