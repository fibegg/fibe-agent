import { describe, it, expect } from 'vitest';
import { isLikelyFile, parseMessageBodyParts, pathDisplayName } from './mention-utils';

describe('pathDisplayName', () => {
  it('returns last path segment for path with slashes', () => {
    expect(pathDisplayName('foo/bar/baz.ts')).toBe('baz.ts');
  });

  it('returns full string for path without slashes', () => {
    expect(pathDisplayName('readme')).toBe('readme');
  });

  it('returns last segment for single segment with extension', () => {
    expect(pathDisplayName('file.json')).toBe('file.json');
  });
});

describe('isLikelyFile', () => {
  it('returns true for path ending with known extension', () => {
    expect(isLikelyFile('src/app.ts')).toBe(true);
    expect(isLikelyFile('readme.md')).toBe(true);
    expect(isLikelyFile('data.json')).toBe(true);
  });

  it('returns true for scss and sass paths', () => {
    expect(isLikelyFile('styles/main.scss')).toBe(true);
    expect(isLikelyFile('test-100kb.scss')).toBe(true);
    expect(isLikelyFile('theme.sass')).toBe(true);
  });

  it('returns false for path with no extension', () => {
    expect(isLikelyFile('src/components')).toBe(false);
    expect(isLikelyFile('foo')).toBe(false);
  });

  it('returns false for path with unknown extension', () => {
    expect(isLikelyFile('file.xyz')).toBe(false);
  });
});

describe('parseMessageBodyParts', () => {
  it('returns single text part when body has no mention at start or after whitespace', () => {
    const body = "import js from '@eslint/js'";
    expect(parseMessageBodyParts(body)).toEqual([{ type: 'text', content: body }]);
  });

  it('splits mention after whitespace and keeps code with @ as text', () => {
    const body = "Check @apps/readme and from '@pkg/name'";
    expect(parseMessageBodyParts(body)).toEqual([
      { type: 'text', content: 'Check ' },
      { type: 'mention', path: 'apps/readme' },
      { type: 'text', content: " and from '@pkg/name'" },
    ]);
  });

  it('treats @ at start of string as mention', () => {
    expect(parseMessageBodyParts('@foo/bar')).toEqual([{ type: 'mention', path: 'foo/bar' }]);
  });
});

