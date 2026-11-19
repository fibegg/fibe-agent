import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const runner = fileURLToPath(new URL('../../apps/api/scripts/run-tests.mjs', import.meta.url));

// A stand-in `bun` whose behaviour depends on the test file name: pass-*
// passes, fail-* always fails, flaky-* fails on its first run only.
const fakeBun = `#!/bin/sh
for arg in "$@"; do file="$arg"; done
echo "fake bun ran $file"
case "$file" in
  *pass-*) exit 0 ;;
  *fail-*) echo "assertion failed in $file" >&2; exit 1 ;;
  *flaky-*)
    marker="$FAKE_BUN_STATE/$(basename "$file").ran"
    if [ -f "$marker" ]; then exit 0; fi
    : > "$marker"
    exit 1 ;;
esac
exit 2
`;

async function makeProject(testFiles) {
  const project = await mkdtemp(path.join(os.tmpdir(), 'fibe-api-run-tests-'));
  const bin = path.join(project, 'bin');
  const state = path.join(project, 'state');
  await mkdir(path.join(project, 'src', 'app'), { recursive: true });
  await mkdir(bin);
  await mkdir(state);
  await writeFile(path.join(project, 'test-setup.ts'), '');
  for (const file of testFiles) {
    await writeFile(path.join(project, 'src', 'app', file), '');
  }
  await writeFile(path.join(bin, 'bun'), fakeBun);
  await chmod(path.join(bin, 'bun'), 0o755);
  return { project, bin, state };
}

function runRunner({ project, bin, state }, args = [], env = {}) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: project,
    encoding: 'utf8',
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_BUN_STATE: state, ...env },
  });
}

test('runs every file, retries a failure once and reports FLAKY files without failing', async () => {
  const fixture = await makeProject(['a-pass-1.test.ts', 'b-flaky-1.test.ts', 'c-pass-2.test.ts']);
  try {
    const child = runRunner(fixture);
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /Running 3 API test files in isolated Bun processes, 2 at a time\./);
    assert.match(child.stdout, /^RETRY src\/app\/b-flaky-1\.test\.ts \(first attempt exit code 1\)$/m);
    assert.match(child.stdout, /^FLAKY src\/app\/b-flaky-1\.test\.ts$/m);
    assert.match(child.stdout, /3 files, 2 passed, 1 flaky, 0 failed/);
    assert.match(child.stdout, /^-- src\/app\/a-pass-1\.test\.ts passed in \d+\.\d\ds$/m);
    assert.match(child.stdout, /API test file durations \(slowest first\):/);
  } finally {
    await rm(fixture.project, { recursive: true, force: true });
  }
});

test('keeps going after a file fails twice and exits non-zero', async () => {
  const fixture = await makeProject(['a-fail-1.test.ts', 'b-pass-1.test.ts', 'c-pass-2.test.ts']);
  try {
    const child = runRunner(fixture, [], { API_TEST_CONCURRENCY: '1' });
    assert.equal(child.status, 1, child.stdout + child.stderr);
    assert.match(child.stdout, /1 at a time/);
    assert.match(child.stdout, /assertion failed in src\/app\/a-fail-1\.test\.ts/);
    assert.match(child.stdout, /^-- src\/app\/c-pass-2\.test\.ts passed/m);
    assert.match(child.stdout, /3 files, 2 passed, 0 flaky, 1 failed/);
    assert.match(child.stdout, /^FAILED src\/app\/a-fail-1\.test\.ts \(failed twice, last exit code 1\)$/m);
    assert.doesNotMatch(child.stdout, /^FLAKY/m);
  } finally {
    await rm(fixture.project, { recursive: true, force: true });
  }
});

test('path arguments select a subset of files', async () => {
  const fixture = await makeProject(['a-pass-1.test.ts', 'b-fail-1.test.ts']);
  try {
    const child = runRunner(fixture, ['a-pass']);
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /Running 1 API test files/);
    assert.doesNotMatch(child.stdout, /b-fail-1/);

    const none = runRunner(fixture, ['no-such-file']);
    assert.equal(none.status, 1);
    assert.match(none.stderr, /No API test files match: no-such-file/);
  } finally {
    await rm(fixture.project, { recursive: true, force: true });
  }
});

test('rejects an invalid concurrency setting', async () => {
  const fixture = await makeProject(['a-pass-1.test.ts']);
  try {
    const child = runRunner(fixture, [], { API_TEST_CONCURRENCY: '0' });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /API_TEST_CONCURRENCY must be a positive integer/);
  } finally {
    await rm(fixture.project, { recursive: true, force: true });
  }
});
