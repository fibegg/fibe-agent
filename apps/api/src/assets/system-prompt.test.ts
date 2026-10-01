import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Guards prompt assets against truncation and structural corruption. */

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..');

const repo = (...parts: string[]) => join(REPO_ROOT, ...parts);

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

describe('prompts/ library: README', () => {
  const readmePath = repo('prompts', 'README.md');

  test('README.md exists', () => {
    expect(existsSync(readmePath)).toBe(true);
  });

  test('README.md documents SYSTEM_PROMPT', () => {
    const content = readFileSync(readmePath, 'utf8');
    expect(content).toContain('SYSTEM_PROMPT');
  });
});

describe('prompts/ library: base prompts', () => {
  const basePrompts: { name: string; requiredPhrases: string[] }[] = [
    {
      name: 'code-playground.md',
      requiredPhrases: [
        'current working directory',
        'Scope rules',
        'Workflow',
        'Code quality',
      ],
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

describe('prompts/ library: provider prompts', () => {
  const providers = [
    'gemini',
    'antigravity',
    'claude-code',
    'openai-codex',
    'opencode',
    'cursor',
  ];

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
        const keyword =
          provider === 'claude-code'
            ? 'claude'
            : provider === 'openai-codex'
              ? 'codex'
              : provider;
        expect(content).toContain(keyword);
      });

      test('mentions workflow', () => {
        const content = readFileSync(filePath, 'utf8');
        expect(content).toContain('Workflow');
      });
    });
  }
});
