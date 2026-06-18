import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalMocks = globalThis as any;
const mockExecFileAsync = globalMocks.__mockExecFileAsync ?? mock();
globalMocks.__mockExecFileAsync = mockExecFileAsync;

mock.module('node:util', () => {
  const util = import.meta.require('node:util');
  return {
    ...util,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    promisify: (fn: any) => {
      if (fn === import.meta.require('node:child_process').execFile) {
        return mockExecFileAsync;
      }
      return util.promisify(fn);
    }
  };
});

const { PlayroomBrowserService } = require('./playroom-browser.service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeService(rootDir: string, playgroundDir: string): any {
  return new PlayroomBrowserService({
    getMarqueeRoot: () => rootDir,
    getPlaygroundsDir: () => playgroundDir,
  } as never);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PlayroomBrowserService', () => {
  let rootDir: string;
  let playgroundDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;

  beforeEach(() => {
    rootDir = tmpDir('playrooms-');
    playgroundDir = tmpDir('playground-');
    service = makeService(rootDir, playgroundDir);
    mockExecFileAsync.mockClear();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    try { rmSync(playgroundDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  // -------------------------------------------------------------------------
  // browse()
  // -------------------------------------------------------------------------

  describe('browse()', () => {
    test('returns empty array when relPath is provided', async () => {
      expect(await service.browse('sub')).toEqual([]);
    });

    test('parses stdout into playground-name BrowseEntry array', async () => {
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify([
          { id: '1', name: 'proj1', playspec: 'fibe.gg/play1', path: `${rootDir}/playgrounds/proj1` },
          { id: '2', name: 'proj2', playspec: 'fibe.gg/play2', path: `${rootDir}/playgrounds/proj2` },
        ]),
      });

      const entries = await service.browse('');

      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({ name: 'proj1', path: 'proj1', type: 'directory' });
      expect(entries[1]).toEqual({ name: 'proj2', path: 'proj2', type: 'directory' });

      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
      expect(mockExecFileAsync.mock.calls[0][0]).toBe('fibe');
      expect(mockExecFileAsync.mock.calls[0][1]).toEqual(['--output', 'json', 'local', 'playgrounds', 'info', '--view', 'names']);
      expect(mockExecFileAsync.mock.calls[0][2].env.MARQUEE_ROOT).toBe(join(rootDir, 'playgrounds'));
    });

    test('trusts the CLI names view to return only mountable playgrounds', async () => {
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify([
          { id: '23', name: 'source-app--23', playspec: 'source-app' },
        ]),
      });

      const entries = await service.browse('');

      expect(entries).toEqual([
        { name: 'source-app--23', path: 'source-app--23', type: 'directory' },
      ]);
    });

    test('deduplicates repeated playground records and ignores missing names', async () => {
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify([
          { id: '1', name: 'alice2', playspec: 'eotm-2' },
          { id: '1', name: 'alice2', playspec: 'eotm-2' },
          { id: '2', name: '', playspec: 'eotm-2' },
          { id: '3', name: 'alice3', playspec: 'eotm-2' },
        ]),
      });

      const entries = await service.browse('');

      expect(entries).toEqual([
        { name: 'alice2', path: 'alice2', type: 'directory' },
        { name: 'alice3', path: 'alice3', type: 'directory' },
      ]);
    });

    test('throws NotFoundException on execution failure', async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error('Script failed'));

      const promise = service.browse('');
      await expect(promise).rejects.toThrow(NotFoundException);
      await expect(promise).rejects.toThrow('Cannot execute Fibe local playgrounds command.');
    });
  });

  // -------------------------------------------------------------------------
  // linkPlayground()
  // -------------------------------------------------------------------------

  describe('linkPlayground()', () => {
    test('throws BadRequestException for empty path', async () => {
      await expect(service.linkPlayground('')).rejects.toThrow(BadRequestException);
      await expect(service.linkPlayground('   ')).rejects.toThrow('Path is required');
    });



    test('runs fibe local playgrounds link when target exists', async () => {
      mkdirSync(join(rootDir, 'playgrounds', 'project'), { recursive: true });
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'Linked' });

      const result = await service.linkPlayground('project');

      expect(result.linkedPath).toBe('project');
      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);

      expect(mockExecFileAsync.mock.calls[0][0]).toBe('fibe');
      expect(mockExecFileAsync.mock.calls[0][1]).toEqual([
        '--output',
        'json',
        'local',
        'playgrounds',
        'link',
        'project',
        '--link-dir',
        playgroundDir,
      ]);
    });

    test('throws BadRequestException if scripting fails', async () => {
      mkdirSync(join(rootDir, 'playgrounds', 'project'), { recursive: true });
      mockExecFileAsync.mockRejectedValueOnce(new Error('Linking failed'));

      await expect(service.linkPlayground('project')).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // unlinkPlayground()
  // -------------------------------------------------------------------------

  describe('unlinkPlayground()', () => {
    test('requires explicit confirmation', async () => {
      writeFileSync(join(playgroundDir, '.current_playground.json'), '{}');

      await expect(service.unlinkPlayground(false)).rejects.toThrow(BadRequestException);
      await expect(service.unlinkPlayground(false)).rejects.toThrow('unlink requires confirm=true');
      expect(existsSync(join(playgroundDir, '.current_playground.json'))).toBe(true);
    });

    test('clears link directory entries and preserves the directory itself', async () => {
      const target = join(rootDir, 'playgrounds', 'project', 'backend');
      mkdirSync(target, { recursive: true });
      symlinkSync(target, join(playgroundDir, 'backend'));
      writeFileSync(join(playgroundDir, '.current_playground.json'), '{}');
      writeFileSync(join(playgroundDir, 'stale.txt'), 'old');
      mkdirSync(join(playgroundDir, 'stale-dir'), { recursive: true });
      writeFileSync(join(playgroundDir, 'stale-dir', 'nested.txt'), 'old');

      await service.unlinkPlayground(true);

      expect(existsSync(playgroundDir)).toBe(true);
      expect(readdirSync(playgroundDir)).toEqual([]);
      expect(existsSync(target)).toBe(true);
    });

    test('rejects when configured link path is a symlink', async () => {
      const realDir = join(rootDir, 'real-playground');
      const linkDir = join(rootDir, 'playground-link');
      mkdirSync(realDir, { recursive: true });
      symlinkSync(realDir, linkDir);
      service = makeService(rootDir, linkDir);

      await expect(service.unlinkPlayground(true)).rejects.toThrow(BadRequestException);
      await expect(service.unlinkPlayground(true)).rejects.toThrow('is not a directory');
    });

    test('rejects when configured link path is a regular file', async () => {
      const filePath = join(rootDir, 'playground-file');
      writeFileSync(filePath, 'not a directory');
      service = makeService(rootDir, filePath);

      await expect(service.unlinkPlayground(true)).rejects.toThrow(BadRequestException);
      await expect(service.unlinkPlayground(true)).rejects.toThrow('is not a directory');
    });
  });

  // -------------------------------------------------------------------------
  // getCurrentLink()
  // -------------------------------------------------------------------------

  describe('getCurrentLink()', () => {
    test('returns current playground name from .current_playground.json before id', async () => {
      writeFileSync(join(playgroundDir, '.current_playground.json'), JSON.stringify({ id: '42', name: 'my-project' }));

      const link = await service.getCurrentLink();
      expect(link).toBe('my-project');
    });

    test('falls back to current playground name from .current_playground.json', async () => {
      writeFileSync(join(playgroundDir, '.current_playground.json'), JSON.stringify({ name: 'my-project' }));

      const link = await service.getCurrentLink();
      expect(link).toBe('my-project');
    });

    test('returns null if .current_playground.json does not exist', async () => {
      const link = await service.getCurrentLink();
      expect(link).toBeNull();
    });

    test('infers current playground from mounted targets when state file is missing', async () => {
      const aliceBackend = join(rootDir, 'playgrounds', 'alice--10', 'backend');
      const aliceFrontend = join(rootDir, 'playgrounds', 'alice--10', 'frontend');
      const bobBackend = join(rootDir, 'playgrounds', 'bob--11', 'backend');
      const bobFrontend = join(rootDir, 'playgrounds', 'bob--11', 'frontend');
      mkdirSync(aliceBackend, { recursive: true });
      mkdirSync(aliceFrontend, { recursive: true });
      mkdirSync(bobBackend, { recursive: true });
      mkdirSync(bobFrontend, { recursive: true });
      symlinkSync(aliceBackend, join(playgroundDir, 'backend'));
      symlinkSync(aliceFrontend, join(playgroundDir, 'frontend'));

      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { id: '10', name: 'alice', playspec: 'eotm-2' },
            { id: '11', name: 'bob', playspec: 'eotm-2' },
          ]),
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { service: 'api', mount: aliceBackend },
            { service: 'frontend', mount: aliceFrontend },
          ]),
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { service: 'api', mount: bobBackend },
            { service: 'frontend', mount: bobFrontend },
          ]),
        });

      const link = await service.getCurrentLink();

      expect(link).toBe('alice');
      expect(mockExecFileAsync.mock.calls[0][1]).toEqual(['--output', 'json', 'local', 'playgrounds', 'info', '--view', 'names']);
      expect(mockExecFileAsync.mock.calls[1][1]).toEqual(['--output', 'json', 'local', 'playgrounds', 'info', '--view', 'mounts', '--playground', 'alice']);
      expect(mockExecFileAsync.mock.calls[2][1]).toEqual(['--output', 'json', 'local', 'playgrounds', 'info', '--view', 'mounts', '--playground', 'bob']);
    });
  });
});
