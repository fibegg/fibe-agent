import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NotFoundException } from '@nestjs/common';
import { PlaygroundsService } from './playgrounds.service';

describe('PlaygroundsService', () => {
  let playgroundDir: string;

  beforeEach(() => {
    playgroundDir = mkdtempSync(join(tmpdir(), 'playground-'));
  });

  afterEach(() => {
    rmSync(playgroundDir, { recursive: true, force: true });
  });

  test('getTree returns empty array when directory is empty', () => {
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(service.getTree()).toEqual([]);
  });

  test('getTree returns directories first then files, each sorted by name', () => {
    writeFileSync(join(playgroundDir, 'b.txt'), '');
    writeFileSync(join(playgroundDir, 'a.txt'), '');
    mkdirSync(join(playgroundDir, 'dir'));
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = service.getTree();
    expect(tree.length).toBe(3);
    expect(tree[0].name).toBe('dir');
    expect(tree[0].type).toBe('directory');
    expect(tree[0].children).toEqual([]);
    expect(tree[1].name).toBe('a.txt');
    expect(tree[1].type).toBe('file');
    expect(tree[2].name).toBe('b.txt');
    expect(tree[2].type).toBe('file');
  });

  test('getTree skips dotfiles and dotdirs', () => {
    writeFileSync(join(playgroundDir, '.hidden'), '');
    writeFileSync(join(playgroundDir, 'visible'), '');
    mkdirSync(join(playgroundDir, '.dotdir'));
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = service.getTree();
    expect(tree.length).toBe(1);
    expect(tree[0].name).toBe('visible');
  });

  test('getTree skips node_modules and .git', () => {
    mkdirSync(join(playgroundDir, 'node_modules'));
    writeFileSync(join(playgroundDir, 'node_modules', 'pkg.js'), '');
    mkdirSync(join(playgroundDir, '.git'));
    writeFileSync(join(playgroundDir, '.git', 'config'), '');
    mkdirSync(join(playgroundDir, 'src'), { recursive: true });
    writeFileSync(join(playgroundDir, 'src', 'index.ts'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = service.getTree();
    expect(tree.length).toBe(1);
    expect(tree[0].name).toBe('src');
    expect(tree.map((e) => e.name)).not.toContain('node_modules');
    expect(tree.map((e) => e.name)).not.toContain('.git');
  });

  test('getTree returns nested structure with relative paths', () => {
    mkdirSync(join(playgroundDir, 'sub'));
    writeFileSync(join(playgroundDir, 'sub', 'file.ts'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = service.getTree();
    expect(tree.length).toBe(1);
    expect(tree[0].path).toBe('sub');
    expect(tree[0].children?.length).toBe(1);
    expect(tree[0].children?.[0].path).toBe('sub/file.ts');
    expect(tree[0].children?.[0].name).toBe('file.ts');
  });

  test('getTree returns empty array when directory does not exist', () => {
    const config = { getPlaygroundsDir: () => join(playgroundDir, 'nonexistent') };
    const service = new PlaygroundsService(config as never);
    expect(service.getTree()).toEqual([]);
  });

  test('getFileContent returns file content for valid path', () => {
    writeFileSync(join(playgroundDir, 'readme.md'), '# Hello\n');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(service.getFileContent('readme.md')).toBe('# Hello\n');
  });

  test('getFileContent returns content for file in subdirectory', () => {
    mkdirSync(join(playgroundDir, 'src'));
    writeFileSync(join(playgroundDir, 'src', 'index.ts'), 'export {};');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(service.getFileContent('src/index.ts')).toBe('export {};');
  });

  test('getFileContent throws NotFoundException for path traversal', () => {
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(() => service.getFileContent('../../etc/passwd')).toThrow(NotFoundException);
  });

  test('getFileContent throws NotFoundException for directory', () => {
    mkdirSync(join(playgroundDir, 'dir'));
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(() => service.getFileContent('dir')).toThrow(NotFoundException);
  });

  test('getFileContent throws NotFoundException for missing file', () => {
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(() => service.getFileContent('missing.txt')).toThrow(NotFoundException);
  });

  test('getFileContent throws NotFoundException for path under node_modules or .git', () => {
    mkdirSync(join(playgroundDir, 'node_modules'), { recursive: true });
    writeFileSync(join(playgroundDir, 'node_modules', 'pkg.js'), '');
    mkdirSync(join(playgroundDir, '.git'), { recursive: true });
    writeFileSync(join(playgroundDir, '.git', 'config'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(() => service.getFileContent('node_modules/pkg.js')).toThrow(NotFoundException);
    expect(() => service.getFileContent('.git/config')).toThrow(NotFoundException);
  });

  test('getFileContent throws NotFoundException when path has node_modules or .git as segment', () => {
    mkdirSync(join(playgroundDir, 'foo', 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(playgroundDir, 'foo', 'node_modules', 'pkg', 'index.js'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(() => service.getFileContent('foo/node_modules/pkg/index.js')).toThrow(NotFoundException);
  });

  test('getFolderFileContents returns all file contents under folder', () => {
    mkdirSync(join(playgroundDir, 'docs'));
    writeFileSync(join(playgroundDir, 'docs', 'a.md'), '# A');
    writeFileSync(join(playgroundDir, 'docs', 'b.md'), '# B');
    mkdirSync(join(playgroundDir, 'docs', 'nested'));
    writeFileSync(join(playgroundDir, 'docs', 'nested', 'c.txt'), 'C');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const result = service.getFolderFileContents('docs');
    expect(result.length).toBe(3);
    const paths = result.map((r) => r.path).sort();
    expect(paths).toEqual(['docs/a.md', 'docs/b.md', 'docs/nested/c.txt']);
    expect(result.find((r) => r.path === 'docs/a.md')?.content).toBe('# A');
    expect(result.find((r) => r.path === 'docs/nested/c.txt')?.content).toBe('C');
  });

  test('getFolderFileContents skips node_modules and .git', () => {
    mkdirSync(join(playgroundDir, 'docs'), { recursive: true });
    writeFileSync(join(playgroundDir, 'docs', 'readme.md'), '# Docs');
    mkdirSync(join(playgroundDir, 'docs', 'node_modules'));
    writeFileSync(join(playgroundDir, 'docs', 'node_modules', 'x.js'), '');
    mkdirSync(join(playgroundDir, 'docs', '.git'));
    writeFileSync(join(playgroundDir, 'docs', '.git', 'HEAD'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const result = service.getFolderFileContents('docs');
    expect(result.length).toBe(1);
    expect(result[0].path).toBe('docs/readme.md');
  });

  test('getFolderFileContents throws NotFoundException for node_modules or .git', () => {
    mkdirSync(join(playgroundDir, 'node_modules'), { recursive: true });
    mkdirSync(join(playgroundDir, '.git'), { recursive: true });
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(() => service.getFolderFileContents('node_modules')).toThrow(NotFoundException);
    expect(() => service.getFolderFileContents('.git')).toThrow(NotFoundException);
  });

  test('getFolderFileContents throws NotFoundException for file path', () => {
    writeFileSync(join(playgroundDir, 'file.txt'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(() => service.getFolderFileContents('file.txt')).toThrow(NotFoundException);
  });
});
