import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveCliBuild, stageCandidateCli, cliBuildArgs, cliImageLabels, providerImageTags } from './cli-build.mjs';

function fixture(arch = 'amd64') {
  const directory = mkdtempSync(path.join(tmpdir(), 'fibe-candidate-cli-'));
  const binary = Buffer.alloc(64);
  binary.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
  binary.writeUInt16LE(arch === 'amd64' ? 62 : 183, 18);
  const filename = path.join(directory, 'input-fibe');
  writeFileSync(filename, binary);
  const sdkSha = '1234567'.padEnd(40, 'a');
  return { directory, binary, env: { FIBE_CANDIDATE_BUILD: '1', FIBE_CLI_VERSION: '0.3.0-rc.1+1234567', FIBE_SDK_SHA: sdkSha, FIBE_CLI_BINARY_SHA256: createHash('sha256').update(binary).digest('hex'), FIBE_CLI_BINARY_PATH: filename, FIBE_CANDIDATE_PLATFORM: `linux/${arch}` } };
}

test('normal builds preserve stable versions, both architectures and branch channels', () => {
  const build = resolveCliBuild({ FIBE_CLI_VERSION: '0.2.46' });
  assert.deepEqual(build.platforms, ['linux/amd64', 'linux/arm64']);
  assert.deepEqual(providerImageTags({ provider: 'opencode', tagName: 'opencode', sourceBranch: 'dev', gitSha: 'abc' }, build), ['opencode-latest-dev', 'opencode-abc']);
  assert.throws(() => resolveCliBuild({ FIBE_CLI_VERSION: '0.3.0-rc.1' }), /stable/);
});

test('candidate build refuses missing or mismatched immutable inputs before publication', () => {
  const f = fixture();
  try {
    for (const key of ['FIBE_SDK_SHA', 'FIBE_CLI_BINARY_SHA256', 'FIBE_CLI_BINARY_PATH']) {
      assert.throws(() => resolveCliBuild({ ...f.env, [key]: undefined }));
    }
    assert.throws(() => resolveCliBuild({ ...f.env, FIBE_CLI_VERSION: '0.3.0' }), /prerelease/);
    assert.throws(() => resolveCliBuild({ ...f.env, FIBE_CLI_VERSION: '0.3.0-rc.1+wrong' }), /metadata/);
    assert.throws(() => resolveCliBuild({ ...f.env, FIBE_CANDIDATE_PLATFORM: 'linux/riscv64' }), /platform/);
    assert.throws(() => stageCandidateCli(resolveCliBuild({ ...f.env, FIBE_CLI_BINARY_SHA256: 'f'.repeat(64) }), f.directory), /SHA-256 mismatch/);
    assert.throws(() => stageCandidateCli(resolveCliBuild({ ...f.env, FIBE_CANDIDATE_PLATFORM: 'linux/arm64' }), f.directory), /architecture/);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('candidate binary staging verifies actual bytes on each architecture and retains the binary', () => {
  for (const arch of ['amd64', 'arm64']) {
    const f = fixture(arch);
    try {
      const build = resolveCliBuild(f.env);
      stageCandidateCli(build, f.directory);
      stageCandidateCli(build, f.directory);
      assert.deepEqual(readFileSync(path.join(f.directory, '.candidate-cli/fibe')), f.binary);
      assert.ok(cliBuildArgs(build).includes('FIBE_CANDIDATE_BUILD=1'));
      assert.ok(cliImageLabels(build).includes(`gg.fibe.cli.sdk.sha=${f.env.FIBE_SDK_SHA}`));
      assert.ok(cliImageLabels(build).includes(`gg.fibe.cli.binary.sha256=${f.env.FIBE_CLI_BINARY_SHA256}`));
      const tags = providerImageTags({ provider: 'claude_code', tagName: 'claude-code', sourceBranch: 'dev', gitSha: 'a'.repeat(40) }, build);
      assert.equal(tags.length, 1);
      assert.match(tags[0], /^claude-code-cand-/);
      assert.ok(!tags[0].includes('latest'));
      assert.throws(() => providerImageTags({ provider: 'claude_code', tagName: 'latest', sourceBranch: 'dev', gitSha: 'a'.repeat(40) }, build), /provider/);
    } finally { rmSync(f.directory, { recursive: true, force: true }); }
  }
});
