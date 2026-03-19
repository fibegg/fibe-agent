import { describe, it, expect } from 'vitest';
import {
  prepareUserMessageMarkdownForRender,
  recoverDenseCodeNewlines,
  recoverDenseCodeNewlinesInFences,
} from './user-markdown-prep';

describe('recoverDenseCodeNewlines', () => {
  it('returns the string unchanged when it already contains newlines', () => {
    const s = 'a\nb';
    expect(recoverDenseCodeNewlines(s)).toBe(s);
  });

  it('inserts newlines before statement keywords after semicolons', () => {
    const oneLine =
      "import type { LoggerService } from '@nestjs/common';const LOG_LEVELS = ['a'] as const;type T = 1;";
    const out = recoverDenseCodeNewlines(oneLine);
    expect(out).toContain("common';\nconst ");
    expect(out).toContain('as const;\ntype ');
  });

  it('inserts newlines before export or function after a closing brace', () => {
    const s =
      'const o={a:1,b:2,c:3,d:4,e:5,f:6,g:7,h:8};export const x=1;function f(){return x;}';
    const out = recoverDenseCodeNewlines(s);
    expect(out).toContain('};\nexport ');
    expect(out).toContain('1;\nfunction ');
  });
});

describe('recoverDenseCodeNewlinesInFences', () => {
  it('reflows a single-line body inside ```ts and rewrites the fence to typescript', () => {
    const fenced =
      "```ts\nimport type { X } from 'a';const y = 1;type Z = typeof y;\n```";
    const out = recoverDenseCodeNewlinesInFences(fenced);
    expect(out.startsWith('```typescript\n')).toBe(true);
    expect(out.endsWith('\n```')).toBe(true);
    expect(out).toContain("from 'a';\nconst ");
  });

  it('reflows when closing fence is on same line as last code token', () => {
    const fenced = "```ts\nimport type { X } from 'a';const y = 1;}```";
    const out = recoverDenseCodeNewlinesInFences(fenced);
    expect(out.startsWith('```typescript\n')).toBe(true);
    expect(out.endsWith('\n```')).toBe(true);
    expect(out).toContain("from 'a';\nconst ");
  });

  it('does not merge lines when the fence body is already multiple non-empty lines', () => {
    const fenced = '```ts\nconst a = 1;\nconst b = 2;\n```';
    expect(recoverDenseCodeNewlinesInFences(fenced)).toBe('```typescript\nconst a = 1;\nconst b = 2;\n```');
  });
});

describe('prepareUserMessageMarkdownForRender', () => {
  it('returns empty string when input is empty', () => {
    expect(prepareUserMessageMarkdownForRender('')).toBe('');
  });

  it('wraps dense TypeScript in a fenced typescript block for display', () => {
    const oneLine =
      "import type { LoggerService } from '@nestjs/common';const LOG_LEVELS = ['error', 'warn'] as const;type LogLevel = (typeof LOG_LEVELS)[number];";
    const out = prepareUserMessageMarkdownForRender(oneLine);
    expect(out.startsWith('```typescript\n')).toBe(true);
    expect(out.endsWith('\n```')).toBe(true);
    expect(out).toContain('\nconst LOG_LEVELS');
  });

  it('normalizes a short fenced block from ts to typescript', () => {
    const fenced = '```ts\nconst x = 1\n```';
    expect(prepareUserMessageMarkdownForRender(fenced)).toBe('```typescript\nconst x = 1\n```');
  });

  it('does not wrap short non-code strings', () => {
    expect(prepareUserMessageMarkdownForRender('Hello **world**')).toBe('Hello **world**');
  });
});
