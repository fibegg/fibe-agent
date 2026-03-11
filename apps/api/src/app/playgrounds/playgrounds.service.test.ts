import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
});
