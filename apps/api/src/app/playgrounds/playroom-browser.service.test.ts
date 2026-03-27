import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlayroomBrowserService } from './playroom-browser.service';

describe('PlayroomBrowserService', () => {
  let rootDir: string;
  let playgroundDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'playrooms-'));
    playgroundDir = mkdtempSync(join(tmpdir(), 'playground-'));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(playgroundDir, { recursive: true, force: true });
  });

  function makeConfig() {
    return {
      getPlayroomsRoot: () => rootDir,
      getPlaygroundsDir: () => playgroundDir,
    } as never;
  }

  test('browse returns empty array for empty directory', async () => {
    const service = new PlayroomBrowserService(makeConfig());
    const entries = await service.browse('');
    expect(entries).toEqual([]);
  });

  test('browse returns directories first, then files, sorted', async () => {
    writeFileSync(join(rootDir, 'b.txt'), '');
    writeFileSync(join(rootDir, 'a.txt'), '');
    mkdirSync(join(rootDir, 'zDir'));
    mkdirSync(join(rootDir, 'aDir'));
    const service = new PlayroomBrowserService(makeConfig());
    const entries = await service.browse('');
    expect(entries.length).toBe(4);
    expect(entries[0]).toEqual({ name: 'aDir', path: 'aDir', type: 'directory' });
    expect(entries[1]).toEqual({ name: 'zDir', path: 'zDir', type: 'directory' });
    expect(entries[2]).toEqual({ name: 'a.txt', path: 'a.txt', type: 'file' });
    expect(entries[3]).toEqual({ name: 'b.txt', path: 'b.txt', type: 'file' });
  });

  test('browse skips hidden entries', async () => {
    writeFileSync(join(rootDir, '.hidden'), '');
    writeFileSync(join(rootDir, 'visible'), '');
    mkdirSync(join(rootDir, '.dotdir'));
    const service = new PlayroomBrowserService(makeConfig());
    const entries = await service.browse('');
    expect(entries.length).toBe(1);
  });

  test('browse navigates into subdirectories', async () => {
    mkdirSync(join(rootDir, 'sub'));
    writeFileSync(join(rootDir, 'sub', 'file.ts'), '');
    mkdirSync(join(rootDir, 'sub', 'nested'));
    const service = new PlayroomBrowserService(makeConfig());
    const entries = await service.browse('sub');
    expect(entries.length).toBe(2);
    expect(entries[0]).toEqual({ name: 'nested', path: 'sub/nested', type: 'directory' });
    expect(entries[1]).toEqual({ name: 'file.ts', path: 'sub/file.ts', type: 'file' });
  });

  test('browse throws for path traversal', async () => {
    const service = new PlayroomBrowserService(makeConfig());
    await expect(service.browse('../../etc')).rejects.toThrow();
  });

  test('browse returns symlink-to-directory as type symlink, sorted with dirs', async () => {
    const realTarget = mkdtempSync(join(tmpdir(), 'symlink-target-'));
    try {
      mkdirSync(join(rootDir, 'normalDir'));
      symlinkSync(realTarget, join(rootDir, 'linkedDir'), 'dir');
      writeFileSync(join(rootDir, 'file.txt'), '');
      const service = new PlayroomBrowserService(makeConfig());
      const entries = await service.browse('');
      // Both dirs (normal + symlink) should appear before file
      expect(entries.length).toBe(3);
      const linkedEntry = entries.find((e) => e.name === 'linkedDir');
      expect(linkedEntry).toBeDefined();
      expect(linkedEntry?.type).toBe('symlink');
      const fileEntry = entries.find((e) => e.name === 'file.txt');
      expect(fileEntry?.type).toBe('file');
      // Dirs come first
      const types = entries.map((e) => e.type);
      expect(types.indexOf('file')).toBeGreaterThan(types.indexOf('symlink'));
    } finally {
      rmSync(realTarget, { recursive: true, force: true });
    }
  });

  test('browse returns symlink-to-file as type file', async () => {
    const realFile = join(rootDir, 'real.txt');
    writeFileSync(realFile, 'content');
    symlinkSync(realFile, join(rootDir, 'link.txt'));
    const service = new PlayroomBrowserService(makeConfig());
    const entries = await service.browse('');
    const link = entries.find((e) => e.name === 'link.txt');
    expect(link).toBeDefined();
    expect(link?.type).toBe('file');
  });

  test('browse throws for non-existent path', async () => {
    const service = new PlayroomBrowserService(makeConfig());
    await expect(service.browse('nonexistent')).rejects.toThrow();
  });

  test('linkPlayground creates symlink and removes old one', async () => {
    // Create a target dir
    mkdirSync(join(rootDir, 'project'));
    writeFileSync(join(rootDir, 'project', 'index.js'), 'hello');

    // Remove the real playground dir first
    rmSync(playgroundDir, { recursive: true, force: true });

    const service = new PlayroomBrowserService(makeConfig());
    const result = await service.linkPlayground('project');
    expect(result.linkedPath).toContain('project');

    // Verify symlink was created
    const st = lstatSync(playgroundDir);
    expect(st.isSymbolicLink()).toBe(true);
    const target = readlinkSync(playgroundDir);
    expect(target).toContain('project');
  });

  test('linkPlayground replaces existing symlink', async () => {
    mkdirSync(join(rootDir, 'projectA'));
    mkdirSync(join(rootDir, 'projectB'));

    // Remove the real playground dir and create initial symlink
    rmSync(playgroundDir, { recursive: true, force: true });
    symlinkSync(join(rootDir, 'projectA'), playgroundDir, 'dir');

    const service = new PlayroomBrowserService(makeConfig());
    await service.linkPlayground('projectB');

    const target = readlinkSync(playgroundDir);
    expect(target).toContain('projectB');
  });

  test('linkPlayground throws for empty path', async () => {
    const service = new PlayroomBrowserService(makeConfig());
    await expect(service.linkPlayground('')).rejects.toThrow();
  });

  test('linkPlayground throws for non-existent target', async () => {
    const service = new PlayroomBrowserService(makeConfig());
    await expect(service.linkPlayground('nonexistent')).rejects.toThrow();
  });

  test('getCurrentLink returns null for regular directory', async () => {
    const service = new PlayroomBrowserService(makeConfig());
    const link = await service.getCurrentLink();
    expect(link).toBeNull();
  });

  test('getCurrentLink returns relative path for symlink', async () => {
    mkdirSync(join(rootDir, 'myProject'));
    rmSync(playgroundDir, { recursive: true, force: true });
    symlinkSync(join(rootDir, 'myProject'), playgroundDir, 'dir');

    const service = new PlayroomBrowserService(makeConfig());
    const link = await service.getCurrentLink();
    expect(link).toBe('myProject');
  });
});
