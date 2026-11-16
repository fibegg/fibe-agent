import { expect, test } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_WORKSPACE_WATCH_MAX_PATHS,
  WorkspacePruner,
  WorkspaceWatcher,
  isGeneratedWorkspacePath,
  workspaceWatchMaxPaths,
  WORKSPACE_REFRESH_MS,
} from './workspace-watcher';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const ready = (watcher: WorkspaceWatcher) =>
  new Promise<void>((resolve) => watcher.watcher.once('ready', resolve));

/** Every path chokidar holds a watch for, the root included. */
function watchedPaths(watcher: WorkspaceWatcher): string[] {
  return Object.entries(watcher.watcher.getWatched()).flatMap(([dir, items]) =>
    items.map((item) => join(dir, item)),
  );
}

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not reached');
    await sleep(50);
  }
}

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
    // The link reaches a directory this watcher already watches.
    expect(watched).not.toContain(join(root, 'linked'));
    expect(watched).toContain(join(repo, 'src'));
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

test('the pruner hides what the file tree hides and rereads an invalidated .gitignore', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-watch-'));
  try {
    mkdirSync(join(root, 'a', 'b'), { recursive: true });
    mkdirSync(join(root, '.fibe'));
    writeFileSync(join(root, '.gitignore'), '*.log\n!keep.log\n');
    writeFileSync(join(root, 'a', '.gitignore'), 'secret/\n');
    writeFileSync(
      join(root, '.fibe', 'settings.json'),
      JSON.stringify({ fileBrowser: { exclude: ['vendor'] } }),
    );
    const pruner = new WorkspacePruner(root);
    expect(pruner.prunes(root)).toBe(false);
    expect(pruner.prunes(join(root, 'debug.log'))).toBe(true);
    expect(pruner.prunes(join(root, 'keep.log'))).toBe(false);
    // Ancestor rules match names at every depth; nested rules only below their directory.
    expect(pruner.prunes(join(root, 'a', 'b', 'trace.log'))).toBe(true);
    expect(pruner.prunes(join(root, 'a', 'secret', 'deep', 'x.ts'))).toBe(true);
    expect(pruner.prunes(join(root, 'secret'))).toBe(false);
    expect(pruner.prunes(join(root, 'a', 'vendor', 'lib.js'))).toBe(true);
    expect(pruner.prunes(join(root, 'a', 'b', 'node_modules', 'x'))).toBe(true);
    expect(pruner.prunes(join(root, 'a', 'b', 'main.ts'))).toBe(false);

    writeFileSync(join(root, 'a', 'b', '.gitignore'), 'main.ts\n');
    expect(pruner.prunes(join(root, 'a', 'b', 'main.ts'))).toBe(false);
    pruner.invalidate(join(root, 'a', 'b'));
    expect(pruner.prunes(join(root, 'a', 'b', 'main.ts'))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a nested .gitignore prunes a large subtree before any watch opens', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-watch-'));
  const web = join(root, 'repo', 'apps', 'web');
  mkdirSync(join(web, 'src'), { recursive: true });
  mkdirSync(join(root, 'repo', 'dist', 'deep'), { recursive: true });
  writeFileSync(join(root, 'repo', '.gitignore'), '*.log\n');
  writeFileSync(join(web, '.gitignore'), '# local runtime\n.sites-runtime/\n');
  writeFileSync(join(web, 'src', 'app.ts'), 'source');
  writeFileSync(join(web, 'src', 'debug.log'), 'log');
  for (let d = 0; d < 20; d++) {
    const dir = join(web, '.sites-runtime', 'pnpm-store', `pkg-${d}`);
    mkdirSync(dir, { recursive: true });
    for (let f = 0; f < 25; f++) writeFileSync(join(dir, `${f}.js`), 'x');
  }
  const watcher = new WorkspaceWatcher(root, () => undefined);
  try {
    await ready(watcher);
    const watched = watchedPaths(watcher);
    expect(watched).toContain(join(web, 'src', 'app.ts'));
    expect(watched).toContain(join(web, '.gitignore'));
    expect(
      watched.filter(
        (path) =>
          path.includes('.sites-runtime') ||
          path.includes('/dist') ||
          path.endsWith('.log'),
      ),
    ).toEqual([]);
    expect(watched.length).toBeLessThan(20);
  } finally {
    watcher.close();
    await watcher.watcher.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a .gitignore change applies to paths created afterwards', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-watch-'));
  mkdirSync(join(root, 'src'));
  const watcher = new WorkspaceWatcher(root, () => undefined);
  try {
    await ready(watcher);
    const gitignoreSeen = new Promise<void>((resolve) =>
      watcher.watcher.on('all', (_event, path) => {
        if (path === join(root, '.gitignore')) resolve();
      }),
    );
    writeFileSync(join(root, '.gitignore'), 'out/\n');
    await gitignoreSeen;
    mkdirSync(join(root, 'out', 'deep'), { recursive: true });
    writeFileSync(join(root, 'out', 'deep', 'a.txt'), 'x');
    mkdirSync(join(root, 'kept'));
    writeFileSync(join(root, 'kept', 'b.txt'), 'x');
    await waitFor(() =>
      watchedPaths(watcher).includes(join(root, 'kept', 'b.txt')),
    );
    await sleep(300);
    expect(
      watchedPaths(watcher).filter((path) => path.startsWith(join(root, 'out'))),
    ).toEqual([]);
  } finally {
    watcher.close();
    await watcher.watcher.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 10000);

test('watchers whose roots link one repository watch it once, both refresh, and the follower takes over on close', async () => {
  const base = mkdtempSync(join(tmpdir(), 'agent-watch-'));
  const repo = join(base, 'real', 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  for (let i = 0; i < 10; i++) writeFileSync(join(repo, 'src', `${i}.ts`), 'x');
  mkdirSync(join(base, 'playgrounds'));
  mkdirSync(join(base, 'work', 'playground'), { recursive: true });
  const playgroundLink = join(base, 'playgrounds', 'repo');
  const agentLink = join(base, 'work', 'playground', 'repo');
  symlinkSync(repo, playgroundLink);
  symlinkSync(repo, agentLink);
  let playgroundRefreshes = 0;
  let agentRefreshes = 0;
  const playground = new WorkspaceWatcher(
    join(base, 'playgrounds'),
    () => playgroundRefreshes++,
  );
  await ready(playground);
  const agent = new WorkspaceWatcher(join(base, 'work'), () => agentRefreshes++);
  const under = (dir: string) => (path: string) =>
    path === dir || path.startsWith(`${dir}/`);
  try {
    await ready(agent);
    expect(watchedPaths(playground)).toContain(join(playgroundLink, 'src', '0.ts'));
    expect(watchedPaths(agent).filter(under(agentLink))).toEqual([]);
    expect(watchedPaths(agent)).toContain(join(base, 'work', 'playground'));

    writeFileSync(join(repo, 'src', 'new.ts'), 'x');
    await sleep(WORKSPACE_REFRESH_MS + 400);
    expect(playgroundRefreshes).toBe(1);
    expect(agentRefreshes).toBe(1);

    playground.close();
    await waitFor(() =>
      watchedPaths(agent).includes(join(agentLink, 'src', '0.ts')),
    );
    await sleep(WORKSPACE_REFRESH_MS + 400); // The handover refresh.
    const beforeChange = agentRefreshes;
    writeFileSync(join(repo, 'src', 'later.ts'), 'x');
    await sleep(WORKSPACE_REFRESH_MS + 400);
    expect(agentRefreshes).toBe(beforeChange + 1);
    expect(playgroundRefreshes).toBe(1);
  } finally {
    playground.close();
    agent.close();
    await Promise.all([playground.watcher.close(), agent.watcher.close()]);
    rmSync(base, { recursive: true, force: true });
  }
}, 20000);

test('the watch budget stops adding paths at the cap and warns once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-watch-'));
  for (let d = 0; d < 3; d++) {
    mkdirSync(join(root, `dir-${d}`));
    for (let f = 0; f < 10; f++)
      writeFileSync(join(root, `dir-${d}`, `${f}.txt`), 'x');
  }
  const warnings: string[] = [];
  const watcher = new WorkspaceWatcher(root, () => undefined, {
    maxPaths: 12,
    warn: (message) => warnings.push(message),
  });
  try {
    await ready(watcher);
    expect(watchedPaths(watcher).length).toBeLessThanOrEqual(12);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(root);
    expect(warnings[0]).toContain('12');
    mkdirSync(join(root, 'dir-new'));
    for (let f = 10; f < 20; f++)
      writeFileSync(join(root, 'dir-0', `${f}.txt`), 'x');
    await sleep(600);
    expect(watchedPaths(watcher).length).toBeLessThanOrEqual(12);
    expect(warnings).toHaveLength(1);
  } finally {
    watcher.close();
    await watcher.watcher.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('FIBE_WATCH_MAX_PATHS overrides the default watch budget', () => {
  expect(workspaceWatchMaxPaths({})).toBe(DEFAULT_WORKSPACE_WATCH_MAX_PATHS);
  expect(workspaceWatchMaxPaths({ FIBE_WATCH_MAX_PATHS: '500' })).toBe(500);
  expect(workspaceWatchMaxPaths({ FIBE_WATCH_MAX_PATHS: '0' })).toBe(
    DEFAULT_WORKSPACE_WATCH_MAX_PATHS,
  );
  expect(workspaceWatchMaxPaths({ FIBE_WATCH_MAX_PATHS: 'lots' })).toBe(
    DEFAULT_WORKSPACE_WATCH_MAX_PATHS,
  );
});
