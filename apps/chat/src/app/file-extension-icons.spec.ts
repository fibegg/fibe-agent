import { describe, it, expect } from 'vitest';
import { getFileIconInfo } from './file-extension-icons';

describe('getFileIconInfo', () => {
  it('returns folder for path without file extension', () => {
    expect(getFileIconInfo('examples').iconId).toBe('folder');
    expect(getFileIconInfo('src/components').iconId).toBe('folder');
  });

  it('returns folder when isDirectory is true', () => {
    expect(getFileIconInfo('src/app.ts', true).iconId).toBe('folder');
  });

  it('returns folder with violet color class', () => {
    const r = getFileIconInfo('docs');
    expect(r.iconId).toBe('folder');
    expect(r.colorClass).toContain('violet');
  });

  it('returns file-code for ts, js, css, scss, html', () => {
    expect(getFileIconInfo('app.ts').iconId).toBe('file-code');
    expect(getFileIconInfo('src/index.tsx').iconId).toBe('file-code');
    expect(getFileIconInfo('styles/main.scss').iconId).toBe('file-code');
    expect(getFileIconInfo('page.html').iconId).toBe('file-code');
  });

  it('returns file-json for json and json5', () => {
    expect(getFileIconInfo('pkg.json').iconId).toBe('file-json');
    expect(getFileIconInfo('data.json5').iconId).toBe('file-json');
  });

  it('returns file-text for md, mdx, txt', () => {
    expect(getFileIconInfo('readme.md').iconId).toBe('file-text');
    expect(getFileIconInfo('note.txt').iconId).toBe('file-text');
  });

  it('returns image for png, jpg, svg', () => {
    expect(getFileIconInfo('logo.png').iconId).toBe('image');
    expect(getFileIconInfo('photo.jpg').iconId).toBe('image');
    expect(getFileIconInfo('icon.svg').iconId).toBe('image');
  });

  it('returns file-config for yaml, toml, env', () => {
    expect(getFileIconInfo('config.yml').iconId).toBe('file-config');
    expect(getFileIconInfo('Cargo.toml').iconId).toBe('file-config');
  });

  it('returns file-data for csv, sql, xml', () => {
    expect(getFileIconInfo('data.csv').iconId).toBe('file-data');
    expect(getFileIconInfo('schema.sql').iconId).toBe('file-data');
  });

  it('returns file for unknown extension', () => {
    expect(getFileIconInfo('file.xyz').iconId).toBe('file');
  });

  it('returns correct color classes per type', () => {
    expect(getFileIconInfo('x.ts').colorClass).toBe('text-green-400');
    expect(getFileIconInfo('x.md').colorClass).toBe('text-blue-400');
    expect(getFileIconInfo('x.png').colorClass).toBe('text-pink-400');
    expect(getFileIconInfo('x.json').colorClass).toBe('text-amber-500');
    expect(getFileIconInfo('x.csv').colorClass).toBe('text-emerald-500');
    expect(getFileIconInfo('x.xyz').colorClass).toBe('text-muted-foreground');
  });

  it('returns file-code for Dockerfile and Makefile', () => {
    expect(getFileIconInfo('Dockerfile').iconId).toBe('file-code');
    expect(getFileIconInfo('Makefile').iconId).toBe('file-code');
  });

  it('returns folder for empty path', () => {
    expect(getFileIconInfo('').iconId).toBe('folder');
  });

  it('returns file-config color class', () => {
    expect(getFileIconInfo('x.yml').colorClass).toBe('text-cyan-500');
  });
});
