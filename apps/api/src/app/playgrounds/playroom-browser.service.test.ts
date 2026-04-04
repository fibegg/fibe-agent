import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  lstatSync,
  readlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlayroomBrowserService } from './playroom-browser.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function makeService(rootDir: string, playgroundDir: string): PlayroomBrowserService {
  return new PlayroomBrowserService({
    getPlayroomsRoot: () => rootDir,
    getPlaygroundsDir: () => playgroundDir,
  } as never);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PlayroomBrowserService', () => {
  let rootDir: string;
  let playgroundDir: string;
  let service: PlayroomBrowserService;

  beforeEach(() => {
    rootDir = tmpDir('playrooms-');
    playgroundDir = tmpDir('playground-'); // real dir by default; removed when a symlink is needed
    service = makeService(rootDir, playgroundDir);
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    // playgroundDir may have been replaced by a symlink — remove either way
    try { rmSync(playgroundDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  // -------------------------------------------------------------------------
  // browse()
  // -------------------------------------------------------------------------

  describe('browse()', () => {
    test('returns empty array for empty directory', async () => {
      expect(await service.browse('')).toEqual([]);
    });

    test('returns directories first then files, each group sorted', async () => {
      writeFileSync(join(rootDir, 'b.txt'), '');
      writeFileSync(join(rootDir, 'a.txt'), '');
      mkdirSync(join(rootDir, 'zDir'));
      mkdirSync(join(rootDir, 'aDir'));

      const entries = await service.browse('');
      expect(entries).toHaveLength(4);
      expect(entries[0]).toEqual({ name: 'aDir', path: 'aDir', type: 'directory' });
      expect(entries[1]).toEqual({ name: 'zDir', path: 'zDir', type: 'directory' });
      expect(entries[2]).toEqual({ name: 'a.txt', path: 'a.txt', type: 'file' });
      expect(entries[3]).toEqual({ name: 'b.txt', path: 'b.txt', type: 'file' });
    });

    test('skips hidden entries (dot-prefixed files and dirs)', async () => {
      writeFileSync(join(rootDir, '.hidden'), '');
      mkdirSync(join(rootDir, '.dotdir'));
      writeFileSync(join(rootDir, 'visible.txt'), '');

      const entries = await service.browse('');
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('visible.txt');
    });

    test('navigates into subdirectories with correct relative paths', async () => {
      mkdirSync(join(rootDir, 'sub'));
      writeFileSync(join(rootDir, 'sub', 'file.ts'), '');
      mkdirSync(join(rootDir, 'sub', 'nested'));

      const entries = await service.browse('sub');
      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({ name: 'nested', path: 'sub/nested', type: 'directory' });
      expect(entries[1]).toEqual({ name: 'file.ts', path: 'sub/file.ts', type: 'file' });
    });

    test('throws for path traversal attempts', async () => {
      await expect(service.browse('../../etc')).rejects.toThrow();
    });

    test('throws for non-existent path', async () => {
      await expect(service.browse('nonexistent')).rejects.toThrow();
    });

    test('symlink-to-directory is reported as type "symlink" and sorted with dirs', async () => {
      const realTarget = tmpDir('symlink-target-');
      try {
        mkdirSync(join(rootDir, 'normalDir'));
        symlinkSync(realTarget, join(rootDir, 'linkedDir'), 'dir');
        writeFileSync(join(rootDir, 'file.txt'), '');

        const entries = await service.browse('');
        expect(entries).toHaveLength(3);

        const linked = entries.find((e) => e.name === 'linkedDir');
        expect(linked?.type).toBe('symlink');

        // Dirs / symlinks come before files
        const fileIdx = entries.findIndex((e) => e.name === 'file.txt');
        const symlinkIdx = entries.findIndex((e) => e.name === 'linkedDir');
        expect(symlinkIdx).toBeLessThan(fileIdx);
      } finally {
        rmSync(realTarget, { recursive: true, force: true });
      }
    });

    test('symlink-to-file is reported as type "file"', async () => {
      const realFile = join(rootDir, 'real.txt');
      writeFileSync(realFile, 'content');
      symlinkSync(realFile, join(rootDir, 'link.txt'));

      const entries = await service.browse('');
      const link = entries.find((e) => e.name === 'link.txt');
      expect(link?.type).toBe('file');
    });

    test('broken symlinks are silently skipped', async () => {
      // Create a symlink to a nonexistent target
      symlinkSync(join(rootDir, 'ghost'), join(rootDir, 'broken-link'));
      writeFileSync(join(rootDir, 'real.txt'), '');

      const entries = await service.browse('');
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('real.txt');
    });
  });

  // -------------------------------------------------------------------------
  // linkPlayground()
  // -------------------------------------------------------------------------

  describe('linkPlayground()', () => {
    test('creates a symlink when playgroundDir does not exist', async () => {
      mkdirSync(join(rootDir, 'project'));
      rmSync(playgroundDir, { recursive: true, force: true }); // remove the real dir

      const result = await service.linkPlayground('project');
      expect(result.linkedPath).toContain('project');

      const st = lstatSync(playgroundDir);
      expect(st.isSymbolicLink()).toBe(true);
      expect(readlinkSync(playgroundDir)).toContain('project');
    });

    test('replaces an existing symlink with a new target', async () => {
      mkdirSync(join(rootDir, 'projectA'));
      mkdirSync(join(rootDir, 'projectB'));
      rmSync(playgroundDir, { recursive: true, force: true });
      symlinkSync(join(rootDir, 'projectA'), playgroundDir, 'dir');

      await service.linkPlayground('projectB');

      expect(readlinkSync(playgroundDir)).toContain('projectB');
    });

    test('replaces an existing regular file at playgroundDir path', async () => {
      mkdirSync(join(rootDir, 'project'));
      // Use a dedicated path for playgroundDir that starts as a file
      const pgDir = join(rootDir, 'pg-link');
      writeFileSync(pgDir, 'stale');
      const svc = makeService(rootDir, pgDir);

      await svc.linkPlayground('project');

      const st = lstatSync(pgDir);
      expect(st.isSymbolicLink()).toBe(true);
    });

    test('throws BadRequestException when playgroundDir is a real directory', async () => {
      mkdirSync(join(rootDir, 'project'));
      // playgroundDir is already a real dir from beforeEach — do NOT remove it

      await expect(service.linkPlayground('project')).rejects.toThrow(/real directory/);
    });

    test('creates parent directories when they are missing', async () => {
      mkdirSync(join(rootDir, 'project'));
      const nested = join(rootDir, 'missing-parent', 'pg-link');
      const svc = makeService(rootDir, nested);

      await svc.linkPlayground('project');

      const st = lstatSync(nested);
      expect(st.isSymbolicLink()).toBe(true);
    });

    test('throws BadRequestException for empty path', async () => {
      await expect(service.linkPlayground('')).rejects.toThrow(/Path is required/);
    });

    test('throws BadRequestException for whitespace-only path', async () => {
      await expect(service.linkPlayground('   ')).rejects.toThrow(/Path is required/);
    });

    test('throws NotFoundException when target does not exist', async () => {
      await expect(service.linkPlayground('nonexistent')).rejects.toThrow(/Target not found/);
    });

    test('throws BadRequestException for path traversal', async () => {
      await expect(service.linkPlayground('../../etc')).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getCurrentLink()
  // -------------------------------------------------------------------------

  describe('getCurrentLink()', () => {
    test('returns null when playgroundDir is a regular directory', async () => {
      // playgroundDir is a real dir from beforeEach
      expect(await service.getCurrentLink()).toBeNull();
    });

    test('returns null when playgroundDir does not exist', async () => {
      rmSync(playgroundDir, { recursive: true, force: true });
      expect(await service.getCurrentLink()).toBeNull();
    });

    test('returns relative path for a symlink to a subdir of PLAYROOMS_ROOT', async () => {
      mkdirSync(join(rootDir, 'myProject'));
      rmSync(playgroundDir, { recursive: true, force: true });
      symlinkSync(join(rootDir, 'myProject'), playgroundDir, 'dir');

      expect(await service.getCurrentLink()).toBe('myProject');
    });

    test('returns absolute path when symlink points outside PLAYROOMS_ROOT', async () => {
      const externalDir = tmpDir('external-');
      try {
        rmSync(playgroundDir, { recursive: true, force: true });
        symlinkSync(externalDir, playgroundDir, 'dir');

        const link = await service.getCurrentLink();
        // link should equal the raw readlink target (absolute), not a relative path
        expect(link).toBe(externalDir);
      } finally {
        rmSync(externalDir, { recursive: true, force: true });
      }
    });
  });
});
