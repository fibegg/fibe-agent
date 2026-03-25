import { describe, it, expect } from 'vitest';
import { getLanguageExtension, getLanguageLabel, LANG_MAP } from './file-editor-cm';

describe('getLanguageExtension', () => {
  it('returns extension for .ts files', () => {
    expect(getLanguageExtension('index.ts')).not.toBeNull();
  });

  it('returns extension for .tsx files', () => {
    expect(getLanguageExtension('app.tsx')).not.toBeNull();
  });

  it('returns extension for .js files', () => {
    expect(getLanguageExtension('main.js')).not.toBeNull();
  });

  it('returns extension for .jsx files', () => {
    expect(getLanguageExtension('component.jsx')).not.toBeNull();
  });

  it('returns extension for .py files', () => {
    expect(getLanguageExtension('script.py')).not.toBeNull();
  });

  it('returns extension for .rs files', () => {
    expect(getLanguageExtension('lib.rs')).not.toBeNull();
  });

  it('returns extension for .go files', () => {
    expect(getLanguageExtension('main.go')).not.toBeNull();
  });

  it('returns extension for .json files', () => {
    expect(getLanguageExtension('package.json')).not.toBeNull();
  });

  it('returns extension for .md files', () => {
    expect(getLanguageExtension('README.md')).not.toBeNull();
  });

  it('returns extension for .css files', () => {
    expect(getLanguageExtension('styles.css')).not.toBeNull();
  });

  it('returns extension for .yaml files', () => {
    expect(getLanguageExtension('.github/ci.yaml')).not.toBeNull();
  });

  it('returns null for .zig (no CM6 module)', () => {
    expect(getLanguageExtension('build.zig')).toBeNull();
  });

  it('returns null for Dockerfile', () => {
    expect(getLanguageExtension('Dockerfile')).toBeNull();
  });

  it('returns null for Dockerfile.dev', () => {
    expect(getLanguageExtension('Dockerfile.dev')).toBeNull();
  });

  it('returns null for unknown extension', () => {
    expect(getLanguageExtension('file.foobar')).toBeNull();
  });

  it('returns null for file with no extension', () => {
    expect(getLanguageExtension('Makefile')).toBeNull();
  });

  it('handles nested path correctly', () => {
    expect(getLanguageExtension('src/utils/helpers.ts')).not.toBeNull();
  });
});

describe('getLanguageLabel', () => {
  it('returns TypeScript for .ts files', () => {
    expect(getLanguageLabel('index.ts')).toBe('TypeScript');
  });

  it('returns TypeScript (TSX) for .tsx files', () => {
    expect(getLanguageLabel('app.tsx')).toBe('TypeScript (TSX)');
  });

  it('returns JavaScript for .js files', () => {
    expect(getLanguageLabel('main.js')).toBe('JavaScript');
  });

  it('returns JavaScript (JSX) for .jsx files', () => {
    expect(getLanguageLabel('Button.jsx')).toBe('JavaScript (JSX)');
  });

  it('returns Python for .py files', () => {
    expect(getLanguageLabel('script.py')).toBe('Python');
  });

  it('returns Rust for .rs files', () => {
    expect(getLanguageLabel('lib.rs')).toBe('Rust');
  });

  it('returns Go for .go files', () => {
    expect(getLanguageLabel('main.go')).toBe('Go');
  });

  it('returns Markdown for .md files', () => {
    expect(getLanguageLabel('README.md')).toBe('Markdown');
  });

  it('returns CSS for .css files', () => {
    expect(getLanguageLabel('styles.css')).toBe('CSS');
  });

  it('returns SCSS for .scss files', () => {
    expect(getLanguageLabel('theme.scss')).toBe('SCSS');
  });

  it('returns YAML for .yml files', () => {
    expect(getLanguageLabel('config.yml')).toBe('YAML');
  });

  it('returns JSON for .json files', () => {
    expect(getLanguageLabel('package.json')).toBe('JSON');
  });

  it('returns SQL for .sql files', () => {
    expect(getLanguageLabel('query.sql')).toBe('SQL');
  });

  it('returns Dockerfile for Dockerfile', () => {
    expect(getLanguageLabel('Dockerfile')).toBe('Dockerfile');
  });

  it('returns Dockerfile for Dockerfile.dev', () => {
    expect(getLanguageLabel('Dockerfile.dev')).toBe('Dockerfile');
  });

  it('returns uppercased extension for unknown types', () => {
    expect(getLanguageLabel('build.zig')).toBe('ZIG');
  });

  it('returns Plain text for file with no extension', () => {
    expect(getLanguageLabel('Makefile')).toBe('Plain text');
  });

  it('handles nested path correctly', () => {
    expect(getLanguageLabel('src/app.ts')).toBe('TypeScript');
  });
});

describe('LANG_MAP', () => {
  it('covers all common web languages', () => {
    const required = ['js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'md'];
    for (const ext of required) {
      expect(LANG_MAP[ext], `Missing LANG_MAP entry for .${ext}`).toBeDefined();
    }
  });

  it('each factory returns a truthy extension', () => {
    for (const [ext, factory] of Object.entries(LANG_MAP)) {
      expect(factory(), `LANG_MAP[${ext}] returned falsy`).toBeTruthy();
    }
  });
});
