import { describe, it, expect } from 'vitest';
import { isLikelyFile, pathDisplayName } from './mention-utils';

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

