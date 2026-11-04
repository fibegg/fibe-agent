import { afterEach, beforeEach, expect, test } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { AgentFilesService } from './agent-files/agent-files.service';
import { PlaygroundsService } from './playgrounds/playgrounds.service';
import {
  TRUSTED_FILES_PROGRAM,
  readTrustedFile,
  writeTrustedFile,
} from './trusted-files';

let fixture: string;
let workspace: string;
let repo: string;
let outside: string;
beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'trusted-files-'));
  workspace = join(fixture, 'workspace');
  repo = join(fixture, 'selected-repo');
  outside = join(fixture, 'outside');
  for (const dir of [workspace, repo, outside]) mkdirSync(dir);
  writeFileSync(join(workspace, 'ordinary.txt'), 'ordinary');
  writeFileSync(join(repo, 'source.txt'), 'repository');
  writeFileSync(join(outside, 'private.txt'), 'outside sentinel');
  symlinkSync(repo, join(workspace, 'linked-repo'));
  symlinkSync(outside, join(workspace, 'escape'));
  symlinkSync(join(outside, 'private.txt'), join(workspace, 'escape.txt'));
  symlinkSync(join(workspace, 'missing'), join(workspace, 'broken'));
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));

for (const kind of ['agent', 'playground']) {
  test(`${kind} bounds recursive links by descriptor ancestry and preserves independent repository aliases`, async () => {
    mkdirSync(join(workspace, 'cycle'));
    writeFileSync(join(workspace, 'cycle', 'note.txt'), 'one line');
    symlinkSync(join(workspace, 'cycle'), join(workspace, 'cycle', 'self'));
    symlinkSync(workspace, join(repo, 'back'));
    symlinkSync(repo, join(workspace, 'second-repo'));
    const playgrounds = new PlaygroundsService(
      { getPlaygroundsDir: () => workspace } as never,
      {} as never,
    );
    playgrounds.getRepos = async () => [{ repo_root: repo }] as never;
    const service =
      kind === 'playground'
        ? playgrounds
        : new AgentFilesService(
            {
              resolveStrategy: () => ({ getWorkingDir: () => workspace }),
            } as never,
            undefined,
            playgrounds,
          );
    const tree = await service.getTree();
    const cycle = tree.find((entry) => entry.name === 'cycle');
    expect(
      cycle?.children?.find((entry) => entry.name === 'self')?.children,
    ).toEqual([]);
    for (const alias of ['linked-repo', 'second-repo']) {
      const children = tree.find((entry) => entry.name === alias)?.children;
      expect(
        children?.find((entry) => entry.name === 'back')?.children,
      ).toEqual([]);
      expect(children?.map((entry) => entry.name)).toContain('source.txt');
    }
    expect((await service.getStats()).fileCount).toBe(4);
    if (kind === 'playground') {
      const contents = await playgrounds.getFolderFileContents('cycle');
      expect(contents.map((entry) => entry.path).sort()).toEqual([
        'cycle/note.txt',
      ]);
    }
  }, 15_000);

  test(`${kind} supports ordinary files and selected repository links but denies outside/broken links`, async () => {
    const playgrounds = new PlaygroundsService(
      { getPlaygroundsDir: () => workspace } as never,
      {} as never,
    );
    playgrounds.getRepos = async () => [{ repo_root: repo }] as never;
    const service =
      kind === 'playground'
        ? playgrounds
        : new AgentFilesService(
            {
              resolveStrategy: () => ({ getWorkingDir: () => workspace }),
            } as never,
            undefined,
            playgrounds,
          );
    const tree = await service.getTree();
    const linked = tree.find((entry) => entry.name === 'linked-repo');
    expect(linked?.type).toBe('directory');
    expect(linked?.children?.map((entry) => entry.name)).toContain(
      'source.txt',
    );
    expect(tree.map((entry) => entry.name)).not.toContain('escape');
    expect(await service.getFileContent('ordinary.txt')).toBe('ordinary');
    expect(await service.getFileContent('linked-repo/source.txt')).toBe(
      'repository',
    );
    await service.saveFileContent('linked-repo/source.txt', 'edited');
    expect(readFileSync(join(repo, 'source.txt'), 'utf8')).toBe('edited');
    await service.uploadFile(
      'linked-repo/new/deep',
      'asset.txt',
      Buffer.from('asset'),
    );
    expect(readFileSync(join(repo, 'new/deep/asset.txt'), 'utf8')).toBe(
      'asset',
    );
    for (const path of [
      'escape.txt',
      'escape/private.txt',
      'broken',
      '../outside/private.txt',
    ]) {
      await expect(service.getFileContent(path)).rejects.toThrow();
      await expect(
        service.saveFileContent(path, 'must not write'),
      ).rejects.toThrow();
    }
    await expect(
      service.uploadFile(
        'escape',
        'private.txt',
        Buffer.from('must not upload'),
      ),
    ).rejects.toThrow();
    await expect(
      service.uploadFile('.git', 'config', Buffer.from('blocked')),
    ).rejects.toThrow();
    expect(readFileSync(join(outside, 'private.txt'), 'utf8')).toBe(
      'outside sentinel',
    );
    playgrounds.getRepos = async () => [];
    await expect(
      service.getFileContent('linked-repo/source.txt'),
    ).rejects.toThrow();
    if (kind === 'playground')
      await expect(
        playgrounds.getFolderFileContents('escape'),
      ).rejects.toThrow();
  });
}

// An audit hook schedules a deterministic adversarial rename between realpath
// admission and the actual open syscall. The production helper body is unchanged.
async function racedOperation(
  action: string,
  target: string,
  swapLeaf: boolean,
) {
  const parent = join(workspace, 'parent');
  mkdirSync(parent);
  writeFileSync(join(parent, 'private.txt'), 'inside');
  const hook = `
import os, sys
done = False
def race(event, args):
    global done
    if not done and event == 'open' and args[0] == ${JSON.stringify(swapLeaf ? 'private.txt' : 'parent')}:
        done = True
        os.rename(${JSON.stringify(swapLeaf ? join(parent, 'private.txt') : parent)}, ${JSON.stringify(join(workspace, 'held'))})
        os.symlink(${JSON.stringify(swapLeaf ? join(outside, 'private.txt') : outside)}, ${JSON.stringify(swapLeaf ? join(parent, 'private.txt') : parent)})
sys.addaudithook(race)
`;
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn('python3', ['-I', '-c', hook + TRUSTED_FILES_PROGRAM], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let result = '';
    child.stdout.on('data', (chunk) => (result += chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) reject(new Error('race fixture failed'));
      else resolve(JSON.parse(result));
    });
    child.stdin.end(
      JSON.stringify({
        root: workspace,
        path: target,
        trustedRoots: [],
        ignoredNames: ['.git'],
        action,
        content: Buffer.from('outside overwrite forbidden').toString('base64'),
      }),
    );
  });
}

for (const action of ['read', 'write']) {
  for (const leaf of [false, true]) {
    test(`${action} rejects a changed ${leaf ? 'leaf' : 'ancestor'} before the descriptor open`, async () => {
      expect(
        (await racedOperation(action, 'parent/private.txt', leaf)).error,
      ).toBe('unavailable');
      expect(readFileSync(join(outside, 'private.txt'), 'utf8')).toBe(
        'outside sentinel',
      );
    });
  }
}
test('upload cannot create a missing file after an ancestor is replaced with an outside link', async () => {
  expect((await racedOperation('write', 'parent/new.txt', false)).error).toBe(
    'unavailable',
  );
  await expect(
    readTrustedFile(
      { root: outside, trustedRoots: [], ignoredNames: [] },
      'new.txt',
    ),
  ).rejects.toThrow();
});
test('oversized writes are rejected before a child can modify the target', async () => {
  await expect(
    writeTrustedFile(
      { root: workspace, trustedRoots: [], ignoredNames: [] },
      'ordinary.txt',
      Buffer.alloc(32 * 1024 * 1024 + 1),
    ),
  ).rejects.toThrow('32 MiB');
  expect(readFileSync(join(workspace, 'ordinary.txt'), 'utf8')).toBe(
    'ordinary',
  );
});

test('reused helper isolates concurrent scopes and survives rejected operations', async () => {
  const scope = {
    root: workspace,
    trustedRoots: [repo],
    ignoredNames: ['.git'],
  };
  const results = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      readTrustedFile(
        { ...scope, trustedRoots: i % 2 ? [] : [repo] },
        'linked-repo/source.txt',
      ).then(
        (value) => value.toString(),
        () => 'denied',
      ),
    ),
  );
  expect(results.filter((value) => value === 'repository').length).toBe(20);
  expect(results.filter((value) => value === 'denied').length).toBe(20);
  await writeTrustedFile(scope, 'empty.txt', Buffer.alloc(0));
  expect((await readTrustedFile(scope, 'empty.txt')).length).toBe(0);
  expect((await readTrustedFile(scope, 'ordinary.txt')).toString()).toBe(
    'ordinary',
  );
});

test('stream protocol continues after errors and keeps size limits', async () => {
  const child = spawn('python3', [
    '-I',
    '-u',
    '-c',
    TRUSTED_FILES_PROGRAM,
    '--stream',
  ]);
  const output: Buffer[] = [];
  child.stdout.on('data', (chunk) => output.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`helper exit ${code}`)),
    );
  });
  const scope = { root: workspace, trustedRoots: [], ignoredNames: ['.git'] };
  for (const path of [
    'escape.txt',
    'ordinary.txt',
    '../outside/private.txt',
    'ordinary.txt',
  ])
    child.stdin.write(
      JSON.stringify({ ...scope, path, action: 'read' }) + '\n',
    );
  child.stdin.end();
  await done;
  const results = Buffer.concat(output)
    .toString()
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(
    results.map(
      (result) =>
        result.error ?? Buffer.from(result.content, 'base64').toString(),
    ),
  ).toEqual(['unavailable', 'ordinary', 'unavailable', 'ordinary']);
});

test('save permission errors name EACCES and the requested path', async () => {
  if (process.getuid?.() === 0) return; // Root can write 0444; exercised as runtime uid 1000 too.
  const { chmodSync } = await import('node:fs');
  chmodSync(join(workspace, 'ordinary.txt'), 0o444);
  await expect(
    writeTrustedFile(
      { root: workspace, trustedRoots: [], ignoredNames: [] },
      'ordinary.txt',
      Buffer.from('edited'),
    ),
  ).rejects.toThrow("EACCES: permission denied, write 'ordinary.txt'");
});

for (const kind of ['agent', 'playground']) {
  test(`${kind} prunes generated trees from stats and listings while retaining explicit file access`, async () => {
    mkdirSync(join(workspace, 'android/build'), { recursive: true });
    writeFileSync(join(workspace, 'android/build/generated.txt'), 'generated');
    const playgrounds = new PlaygroundsService(
      { getPlaygroundsDir: () => workspace } as never,
      {} as never,
    );
    playgrounds.getRepos = async () => [];
    const service =
      kind === 'playground'
        ? playgrounds
        : new AgentFilesService(
            {
              resolveStrategy: () => ({ getWorkingDir: () => workspace }),
            } as never,
            undefined,
            playgrounds,
          );
    expect((await service.getStats()).fileCount).toBe(1);
    const android = (await service.getTree()).find(
      (entry) => entry.name === 'android',
    );
    expect(android?.children).toEqual([]);
    expect(await service.getFileContent('android/build/generated.txt')).toBe(
      'generated',
    );
  });
}
