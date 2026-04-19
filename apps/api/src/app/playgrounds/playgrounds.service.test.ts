import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NotFoundException } from '@nestjs/common';

const globalMocks = globalThis as any;
const mockExecFileAsync = globalMocks.__mockExecFileAsync ?? mock();
globalMocks.__mockExecFileAsync = mockExecFileAsync;

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

const { PlaygroundsService } = require('./playgrounds.service');

describe('PlaygroundsService', () => {
  let playgroundDir: string;

  beforeEach(() => {
    playgroundDir = mkdtempSync(join(tmpdir(), 'playground-'));
    mockExecFileAsync.mockClear();
  });

  afterEach(() => {
    rmSync(playgroundDir, { recursive: true, force: true });
  });

  test('getTree returns empty array when directory is empty', async () => {
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(await service.getTree()).toEqual([]);
  });

  test('getTree returns directories first then files, each sorted by name', async () => {
    writeFileSync(join(playgroundDir, 'b.txt'), '');
    writeFileSync(join(playgroundDir, 'a.txt'), '');
    mkdirSync(join(playgroundDir, 'dir'));
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = await service.getTree();
    expect(tree.length).toBe(3);
    expect(tree[0].name).toBe('dir');
    expect(tree[0].type).toBe('directory');
    expect(tree[0].children).toEqual([]);
    expect(tree[1].name).toBe('a.txt');
    expect(tree[1].type).toBe('file');
    expect(tree[2].name).toBe('b.txt');
    expect(tree[2].type).toBe('file');
  });

  test('getTree skips dotfiles and dotdirs but shows .claude', async () => {
    writeFileSync(join(playgroundDir, '.hidden'), '');
    writeFileSync(join(playgroundDir, 'visible'), '');
    mkdirSync(join(playgroundDir, '.dotdir'));
    mkdirSync(join(playgroundDir, '.claude'));
    writeFileSync(join(playgroundDir, '.claude', 'settings.json'), '{}');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = await service.getTree();
    expect(tree.length).toBe(2);
    expect(tree[0].name).toBe('.claude');
    expect(tree[0].type).toBe('directory');
    expect(tree[0].children?.length).toBe(1);
    expect(tree[1].name).toBe('visible');
  });

  test('getTree skips node_modules and .git', async () => {
    mkdirSync(join(playgroundDir, 'node_modules'));
    writeFileSync(join(playgroundDir, 'node_modules', 'pkg.js'), '');
    mkdirSync(join(playgroundDir, '.git'));
    writeFileSync(join(playgroundDir, '.git', 'config'), '');
    mkdirSync(join(playgroundDir, 'src'), { recursive: true });
    writeFileSync(join(playgroundDir, 'src', 'index.ts'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = await service.getTree();
    expect(tree.length).toBe(1);
    expect(tree[0].name).toBe('src');
    expect(tree.map((e) => e.name)).not.toContain('node_modules');
    expect(tree.map((e) => e.name)).not.toContain('.git');
  });

  test('getTree returns nested structure with relative paths', async () => {
    mkdirSync(join(playgroundDir, 'sub'));
    writeFileSync(join(playgroundDir, 'sub', 'file.ts'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = await service.getTree();
    expect(tree.length).toBe(1);
    expect(tree[0].path).toBe('sub');
    expect(tree[0].children?.length).toBe(1);
    expect(tree[0].children?.[0].path).toBe('sub/file.ts');
    expect(tree[0].children?.[0].name).toBe('file.ts');
  });

  test('getTree returns git status for files in a git repository', async () => {
    // 1. Initialize a git repository in the playground directory
    execSync('git init', { cwd: playgroundDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: playgroundDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: playgroundDir, stdio: 'ignore' });

    // 2. Create some files
    writeFileSync(join(playgroundDir, 'untracked.txt'), 'untracked');
    writeFileSync(join(playgroundDir, 'tracked.txt'), 'tracked');
    writeFileSync(join(playgroundDir, 'modified.txt'), 'modified');
    
    // 3. Mark tracked and modified as tracked by git
    execSync('git add tracked.txt modified.txt', { cwd: playgroundDir, stdio: 'ignore' });
    execSync('git commit -m "initial commit"', { cwd: playgroundDir, stdio: 'ignore' });
    
    // 4. Modify 'modified.txt' so git sees it as changed
    writeFileSync(join(playgroundDir, 'modified.txt'), 'modified-changed');
    
    // 5. Check tree output
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = await service.getTree();
    
    expect(tree.length).toBeGreaterThanOrEqual(3);
    
    const untrackedNode = tree.find(n => n.name === 'untracked.txt');
    const modifiedNode = tree.find(n => n.name === 'modified.txt');
    const trackedNode = tree.find(n => n.name === 'tracked.txt');
    
    expect(untrackedNode?.gitStatus).toBe('untracked');
    expect(modifiedNode?.gitStatus).toBe('modified');
    expect(trackedNode?.gitStatus).toBeUndefined(); // clean files have no status
  });

  test('getTree returns empty array when directory does not exist', async () => {
    const config = { getPlaygroundsDir: () => join(playgroundDir, 'nonexistent') };
    const service = new PlaygroundsService(config as never);
    expect(await service.getTree()).toEqual([]);
  });

  test('getFileContent returns file content for valid path', async () => {
    writeFileSync(join(playgroundDir, 'readme.md'), '# Hello\n');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(await service.getFileContent('readme.md')).toBe('# Hello\n');
  });

  test('getFileContent returns content for file in subdirectory', async () => {
    mkdirSync(join(playgroundDir, 'src'));
    writeFileSync(join(playgroundDir, 'src', 'index.ts'), 'export {};');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    expect(await service.getFileContent('src/index.ts')).toBe('export {};');
  });

  test('getFileContent throws NotFoundException for path traversal', async () => {
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    await expect(service.getFileContent('../../etc/passwd')).rejects.toThrow(NotFoundException);
  });

  test('getFileContent throws NotFoundException for directory', async () => {
    mkdirSync(join(playgroundDir, 'dir'));
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    await expect(service.getFileContent('dir')).rejects.toThrow(NotFoundException);
  });

  test('getFileContent throws NotFoundException for missing file', async () => {
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    await expect(service.getFileContent('missing.txt')).rejects.toThrow(NotFoundException);
  });

  test('getFileContent throws NotFoundException for path under node_modules or .git', async () => {
    mkdirSync(join(playgroundDir, 'node_modules'), { recursive: true });
    writeFileSync(join(playgroundDir, 'node_modules', 'pkg.js'), '');
    mkdirSync(join(playgroundDir, '.git'), { recursive: true });
    writeFileSync(join(playgroundDir, '.git', 'config'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    await expect(service.getFileContent('node_modules/pkg.js')).rejects.toThrow(NotFoundException);
    await expect(service.getFileContent('.git/config')).rejects.toThrow(NotFoundException);
  });

  test('getFileContent throws NotFoundException when path has node_modules or .git as segment', async () => {
    mkdirSync(join(playgroundDir, 'foo', 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(playgroundDir, 'foo', 'node_modules', 'pkg', 'index.js'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    await expect(service.getFileContent('foo/node_modules/pkg/index.js')).rejects.toThrow(NotFoundException);
  });

  test('getFolderFileContents returns all file contents under folder', async () => {
    mkdirSync(join(playgroundDir, 'docs'));
    writeFileSync(join(playgroundDir, 'docs', 'a.md'), '# A');
    writeFileSync(join(playgroundDir, 'docs', 'b.md'), '# B');
    mkdirSync(join(playgroundDir, 'docs', 'nested'));
    writeFileSync(join(playgroundDir, 'docs', 'nested', 'c.txt'), 'C');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const result = await service.getFolderFileContents('docs');
    expect(result.length).toBe(3);
    const paths = result.map((r) => r.path).sort();
    expect(paths).toEqual(['docs/a.md', 'docs/b.md', 'docs/nested/c.txt']);
    expect(result.find((r) => r.path === 'docs/a.md')?.content).toBe('# A');
    expect(result.find((r) => r.path === 'docs/nested/c.txt')?.content).toBe('C');
  });

  test('getFolderFileContents skips node_modules and .git', async () => {
    mkdirSync(join(playgroundDir, 'docs'), { recursive: true });
    writeFileSync(join(playgroundDir, 'docs', 'readme.md'), '# Docs');
    mkdirSync(join(playgroundDir, 'docs', 'node_modules'));
    writeFileSync(join(playgroundDir, 'docs', 'node_modules', 'x.js'), '');
    mkdirSync(join(playgroundDir, 'docs', '.git'));
    writeFileSync(join(playgroundDir, 'docs', '.git', 'HEAD'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const result = await service.getFolderFileContents('docs');
    expect(result.length).toBe(1);
    expect(result[0].path).toBe('docs/readme.md');
  });

  test('getFolderFileContents throws NotFoundException for node_modules or .git', async () => {
    mkdirSync(join(playgroundDir, 'node_modules'), { recursive: true });
    mkdirSync(join(playgroundDir, '.git'), { recursive: true });
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    await expect(service.getFolderFileContents('node_modules')).rejects.toThrow(NotFoundException);
    await expect(service.getFolderFileContents('.git')).rejects.toThrow(NotFoundException);
  });

  test('getFolderFileContents throws NotFoundException for file path', async () => {
    writeFileSync(join(playgroundDir, 'file.txt'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    await expect(service.getFolderFileContents('file.txt')).rejects.toThrow(NotFoundException);
  });

  test('getTree handles symlink to file correctly', async () => {
    const { symlinkSync } = require('node:fs');
    writeFileSync(join(playgroundDir, 'real.txt'), 'content');
    symlinkSync(join(playgroundDir, 'real.txt'), join(playgroundDir, 'link.txt'));

    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = await service.getTree();

    const names = tree.map((e: { name: string }) => e.name);
    expect(names).toContain('real.txt');
    expect(names).toContain('link.txt');
  });

  test('countStats follows symlinks to files', async () => {
    const { symlinkSync } = require('node:fs');
    writeFileSync(join(playgroundDir, 'real.txt'), 'line1\nline2\n');
    symlinkSync(join(playgroundDir, 'real.txt'), join(playgroundDir, 'link.txt'));

    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const stats = await service.getStats();

    expect(stats.fileCount).toBe(2);
  });

  test('getTree does not crash on broken symlinks', async () => {
    const { symlinkSync } = require('node:fs');
    symlinkSync(join(playgroundDir, 'nonexistent'), join(playgroundDir, 'broken-link'));

    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const tree = await service.getTree();

    expect(tree).toEqual([]);
  });

  test('getTree with symlink cycle does not hang or crash (BUG: no cycle detection)', async () => {
    const { symlinkSync } = require('node:fs');
    mkdirSync(join(playgroundDir, 'dir-a'));
    symlinkSync(join(playgroundDir, 'dir-a'), join(playgroundDir, 'dir-a', 'self-loop'));

    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);

    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000));
    const result = await Promise.race([
      service.getTree().then(() => 'done' as const).catch(() => 'error' as const),
      timeout,
    ]);

    expect(result).not.toBe('timeout');
  });

  test('getFileContent rejects paths with null bytes', async () => {
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    await expect(service.getFileContent('file\x00.txt')).rejects.toThrow();
  });

  test('saveFileContent rejects path traversal', async () => {
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    await expect(service.saveFileContent('../../etc/evil', 'pwned')).rejects.toThrow(NotFoundException);
  });

  test('saveFileContent creates parent directories', async () => {
    writeFileSync(join(playgroundDir, 'placeholder'), '');
    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);

    await service.saveFileContent('new-dir/sub/file.txt', 'content');

    const { readFileSync: rfs } = require('node:fs');
    expect(rfs(join(playgroundDir, 'new-dir', 'sub', 'file.txt'), 'utf8')).toBe('content');
  });

  test('collectFileContents handles deeply nested directories without stack overflow', async () => {
    let current = playgroundDir;
    for (let i = 0; i < 20; i++) {
      current = join(current, `d${i}`);
      mkdirSync(current);
    }
    writeFileSync(join(current, 'deep.txt'), 'deep content');

    const config = { getPlaygroundsDir: () => playgroundDir };
    const service = new PlaygroundsService(config as never);
    const files = await service.getFolderFileContents('d0');

    expect(files.length).toBeGreaterThan(0);
    expect(files[0].path).toContain('deep.txt');
  });

  test('getUrls uses local-playgrounds urls when a current link exists', async () => {
    const config = {
      getPlaygroundsDir: () => playgroundDir,
      getPlayroomsRoot: () => '/opt/fibe',
    };
    const playroomBrowser = { getCurrentLink: async () => 'project' };
    const service = new PlaygroundsService(config as never, playroomBrowser as never);
    mockExecFileAsync.mockResolvedValueOnce({ stdout: 'web|web.example.test\n' });

    const urls = await service.getUrls();

    expect(urls).toEqual(['web|web.example.test']);
    expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
    expect(mockExecFileAsync.mock.calls[0][0]).toBe('fibe');
    expect(mockExecFileAsync.mock.calls[0][1]).toEqual([
      '--output',
      'table',
      'local-playgrounds',
      'urls',
      'project',
    ]);
    expect(mockExecFileAsync.mock.calls[0][2].env.PLAYROOMS_ROOT).toBe('/opt/fibe/playgrounds');
  });

  test('getUrls lists playgrounds and combines urls when no current link exists', async () => {
    const config = {
      getPlaygroundsDir: () => playgroundDir,
      getPlayroomsRoot: () => '/opt/fibe',
    };
    const playroomBrowser = { getCurrentLink: async () => null };
    const service = new PlaygroundsService(config as never, playroomBrowser as never);
    mockExecFileAsync
      .mockResolvedValueOnce({ stdout: 'pg1|spec1\npg2|spec2\n' })
      .mockResolvedValueOnce({ stdout: 'web|web1.example.test\n' })
      .mockResolvedValueOnce({ stdout: 'api|api2.example.test\n' });

    const urls = await service.getUrls();

    expect(urls).toEqual(['web|web1.example.test', 'api|api2.example.test']);
    expect(mockExecFileAsync).toHaveBeenCalledTimes(3);
    expect(mockExecFileAsync.mock.calls[0][1]).toEqual(['--output', 'table', 'local-playgrounds', 'list']);
    expect(mockExecFileAsync.mock.calls[1][1]).toEqual(['--output', 'table', 'local-playgrounds', 'urls', 'pg1']);
    expect(mockExecFileAsync.mock.calls[2][1]).toEqual(['--output', 'table', 'local-playgrounds', 'urls', 'pg2']);
  });

  test('getUrls returns empty array on local-playgrounds failure', async () => {
    const config = {
      getPlaygroundsDir: () => playgroundDir,
      getPlayroomsRoot: () => '/opt/fibe',
    };
    const playroomBrowser = { getCurrentLink: async () => null };
    const service = new PlaygroundsService(config as never, playroomBrowser as never);
    mockExecFileAsync.mockRejectedValueOnce(new Error('fibe failed'));
    const consoleError = mock(() => {});
    const originalConsoleError = console.error;
    console.error = consoleError as unknown as typeof console.error;

    try {
      expect(await service.getUrls()).toEqual([]);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
