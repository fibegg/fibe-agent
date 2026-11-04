import { expect, test } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WorkspaceWatcher,
  isGeneratedWorkspacePath,
  WORKSPACE_REFRESH_MS,
} from './workspace-watcher';

test('generated paths are pruned at every repository depth', () => {
  for (const name of [
    'node_modules',
    '.git',
    'build',
    '.gradle',
    '.expo',
    '.next',
    'dist',
    '.cache',
    'caches',
  ]) {
    expect(
      isGeneratedWorkspacePath('/root', `/root/repo/android/${name}/file`),
    ).toBe(true);
  }
  expect(isGeneratedWorkspacePath('/root', '/root/repo/src/build.ts')).toBe(
    false,
  );
});

test('build storms open no generated watches; linked source changes are coalesced and close cancels work', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-watch-'));
  let count = 0;
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'android', 'build', 'deep'), { recursive: true });
  mkdirSync(join(repo, 'node_modules', 'package'), { recursive: true });
  symlinkSync(repo, join(root, 'linked'));
  const watcher = new WorkspaceWatcher(root, () => count++);
  try {
    await new Promise<void>((resolve) =>
      watcher.watcher.once('ready', resolve),
    );
    const watched = Object.keys(watcher.watcher.getWatched());
    expect(
      watched.some(
        (path) => path.includes('/build') || path.includes('/node_modules'),
      ),
    ).toBe(false);
    for (let i = 0; i < 100; i++)
      writeFileSync(join(repo, 'android/build/deep', `${i}.txt`), 'build');
    await new Promise((resolve) =>
      setTimeout(resolve, WORKSPACE_REFRESH_MS + 150),
    );
    expect(count).toBe(0);
    for (let i = 0; i < 10; i++)
      writeFileSync(join(repo, 'src', `${i}.ts`), 'source');
    await new Promise((resolve) =>
      setTimeout(resolve, WORKSPACE_REFRESH_MS + 250),
    );
    expect(count).toBe(1);
    writeFileSync(join(repo, 'src', 'last.ts'), 'source');
    watcher.close();
    await new Promise((resolve) =>
      setTimeout(resolve, WORKSPACE_REFRESH_MS + 150),
    );
    expect(count).toBe(1);
  } finally {
    await watcher.watcher.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 10000);

test('a swapped link directory is still watched', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-watch-swap-'));
  let count = 0;
  const linkDir = join(root, 'playground');
  const repo = join(root, 'repo');
  mkdirSync(linkDir);
  mkdirSync(join(repo, 'src'), { recursive: true });
  const watcher = new WorkspaceWatcher(linkDir, () => count++);
  try {
    await new Promise<void>((resolve) =>
      watcher.watcher.once('ready', resolve),
    );
    // `fibe local playgrounds link` replaces the whole link directory at once.
    const next = join(root, 'playground.next');
    mkdirSync(next);
    symlinkSync(repo, join(next, 'demo-api'));
    renameSync(next, linkDir);
    await new Promise((resolve) =>
      setTimeout(resolve, WORKSPACE_REFRESH_MS + 250),
    );
    expect(count).toBe(1);
    writeFileSync(join(repo, 'src', 'edited.ts'), 'source');
    await new Promise((resolve) =>
      setTimeout(resolve, WORKSPACE_REFRESH_MS + 250),
    );
    expect(count).toBe(2);
  } finally {
    watcher.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 10000);
