import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockExecFileAsync = mock();

mock.module('node:util', () => {
  const util = import.meta.require('node:util');
  return {
    ...util,
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

function makeService(rootDir: string, playgroundDir: string): any {
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

    test('parses stdout into BrowseEntry array', async () => {
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: `proj1|fibe.gg/play1\nproj2|fibe.gg/play2\n`
      });

      const entries = await service.browse('');

      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({ name: 'fibe.gg/play1', path: 'proj1', type: 'directory' });
      expect(entries[1]).toEqual({ name: 'fibe.gg/play2', path: 'proj2', type: 'directory' });

      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
      expect(mockExecFileAsync.mock.calls[0][1]).toEqual([expect.stringContaining('playgrounds-explorer')]);
    });

    test('throws NotFoundException on execution failure', async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error('Script failed'));

      await expect(service.browse('')).rejects.toThrow(NotFoundException);
      await expect(service.browse('')).rejects.toThrow('Cannot execute Playgrounds Explorer.');
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

    test('throws BadRequestException for path traversal attempts', async () => {
      await expect(service.linkPlayground('../../etc')).rejects.toThrow(BadRequestException);
    });

    test('throws NotFoundException if target does not exist', async () => {
      await expect(service.linkPlayground('nonexistent')).rejects.toThrow(NotFoundException);
    });

    test('runs playgrounds-explorer --link when target exists', async () => {
      mkdirSync(join(rootDir, 'playgrounds', 'project'), { recursive: true });
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'Linked' });

      const result = await service.linkPlayground('project');

      expect(result.linkedPath).toContain('project');
      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain('project');
      expect(args).toContain('--link');
      expect(args).toContain('--link-dir');
      expect(args).toContain(playgroundDir);
    });

    test('throws BadRequestException if scripting fails', async () => {
      mkdirSync(join(rootDir, 'playgrounds', 'project'), { recursive: true });
      mockExecFileAsync.mockRejectedValueOnce(new Error('Linking failed'));

      await expect(service.linkPlayground('project')).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // getCurrentLink()
  // -------------------------------------------------------------------------

  describe('getCurrentLink()', () => {
    test('returns content of .current_playground', async () => {
      writeFileSync(join(playgroundDir, '.current_playground'), 'my-project\n');

      const link = await service.getCurrentLink();
      expect(link).toBe('my-project');
    });

    test('returns null if .current_playground does not exist', async () => {
      const link = await service.getCurrentLink();
      expect(link).toBeNull();
    });
  });
});
