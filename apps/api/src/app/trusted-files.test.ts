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
