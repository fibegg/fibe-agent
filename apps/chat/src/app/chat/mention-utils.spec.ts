import { describe, it, expect } from 'vitest';
import { getFileIconType, isLikelyFile, pathDisplayName } from './mention-utils';

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

describe('getFileIconType', () => {
  it('returns folder for path without file extension', () => {
    expect(getFileIconType('examples').type).toBe('folder');
    expect(getFileIconType('src/components').type).toBe('folder');
  });

  it('returns folder with violet color class', () => {
    const r = getFileIconType('docs');
    expect(r.type).toBe('folder');
    expect(r.colorClass).toContain('violet');
  });

  it('returns code for ts, js, css, scss, html', () => {
    expect(getFileIconType('app.ts').type).toBe('code');
    expect(getFileIconType('src/index.tsx').type).toBe('code');
    expect(getFileIconType('styles/main.scss').type).toBe('code');
    expect(getFileIconType('page.html').type).toBe('code');
  });

  it('returns doc for md, mdx, txt', () => {
    expect(getFileIconType('readme.md').type).toBe('doc');
    expect(getFileIconType('note.txt').type).toBe('doc');
  });

  it('returns image for png, jpg, svg', () => {
    expect(getFileIconType('logo.png').type).toBe('image');
    expect(getFileIconType('photo.jpg').type).toBe('image');
    expect(getFileIconType('icon.svg').type).toBe('image');
  });

  it('returns file for unknown extension', () => {
    expect(getFileIconType('data.csv').type).toBe('file');
    expect(getFileIconType('file.xyz').type).toBe('file');
  });

  it('returns correct color classes per type', () => {
    expect(getFileIconType('x.ts').colorClass).toBe('text-green-400');
    expect(getFileIconType('x.md').colorClass).toBe('text-blue-400');
    expect(getFileIconType('x.png').colorClass).toBe('text-pink-400');
    expect(getFileIconType('x.csv').colorClass).toBe('text-muted-foreground');
  });
});
