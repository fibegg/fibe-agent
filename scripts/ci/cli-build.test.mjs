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

function releaseFixture(options = {}) {
  const calls = [];
  const version = options.version || '9.8.7';
  const assets = ['checksums.txt', ...['amd64', 'arm64'].map(arch => `fibe_${version}_linux_${arch}.tar.gz`)]
    .filter(name => name !== options.missingAsset).map(name => ({ name, browser_download_url: `https://github.com/fibegg/sdk/releases/download/v${version}/${name}` }));
  const release = { tag_name: `v${version}`, assets, ...options.release };
  const fetchRelease = async (url, init) => {
    calls.push({ url, init });
    if (options.unavailable) throw new Error('network unavailable');
    return { ok: !options.httpError, status: 503,
      json: async () => url.includes('/commits/') ? { sha: options.commit || 'a'.repeat(40) } : release,
      text: async () => options.checksums ?? ['amd64', 'arm64'].map(arch => `${arch === 'amd64' ? 'b' : 'c'}`.repeat(64) + `  fibe_${version}_linux_${arch}.tar.gz`).join('\n') };
  };
  return { calls, fetchRelease };
}

test('normal builds resolve latest once before cache selection and preserve branch channels', async () => {
  const f = releaseFixture();
  const build = await resolveCliBuild({}, f.fetchRelease);
  assert.equal(build.version, '9.8.7');
  assert.equal(build.sdkSha, 'a'.repeat(40));
  assert.deepEqual(build.platforms, ['linux/amd64', 'linux/arm64']);
  assert.deepEqual(providerImageTags({ provider: 'opencode', tagName: 'opencode', sourceBranch: 'dev', gitSha: 'abc' }, build), ['opencode-latest-dev', 'opencode-abc']);
  assert.equal(f.calls.filter(call => call.url.endsWith('/releases/latest')).length, 1);
  assert.equal(f.calls.filter(call => call.url.startsWith('https://api.github.com')).length, 2);
  assert.ok(cliBuildArgs(build).includes(`FIBE_CLI_ARCHIVE_SHA256_AMD64=${'b'.repeat(64)}`));
  assert.ok(cliBuildArgs(build).includes(`FIBE_CLI_ARCHIVE_SHA256_ARM64=${'c'.repeat(64)}`));
  assert.ok(cliBuildArgs(build).includes(`FIBE_SDK_SHA=${build.sdkSha}`));
  assert.ok(cliImageLabels(build).includes(`gg.fibe.cli.archive.arm64.sha256=${'c'.repeat(64)}`));
  assert.ok(cliImageLabels(build).includes(`gg.fibe.cli.sdk.sha=${build.sdkSha}`));
  await assert.rejects(resolveCliBuild({ FIBE_CLI_VERSION: '0.3.0-rc.1' }, f.fetchRelease), /stable/);
});

test('explicit stable version overrides latest and GitHub token stays on metadata requests', async () => {
  const f = releaseFixture();
  await resolveCliBuild({ FIBE_CLI_VERSION: 'v9.8.7', GH_TOKEN: 'fixture-token' }, f.fetchRelease);
  assert.ok(f.calls[0].url.endsWith('/releases/tags/v9.8.7'));
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer fixture-token');
  assert.equal(f.calls[1].init.headers.Authorization, undefined);
});

test('new latest release is discovered even after a previous resolution', async () => {
  const first = await resolveCliBuild({}, releaseFixture().fetchRelease);
  const second = await resolveCliBuild({}, releaseFixture({ version: '9.8.8' }).fetchRelease);
  assert.notEqual(first.version, second.version);
  assert.notDeepEqual({ version: first.version, args: cliBuildArgs(first) }, { version: second.version, args: cliBuildArgs(second) });
});

test('missing assets, invalid checksums, unavailable API and unstable releases fail closed', async () => {
  for (const options of [
    { missingAsset: 'checksums.txt' }, { missingAsset: 'fibe_9.8.7_linux_arm64.tar.gz' },
    { checksums: '' }, { checksums: 'invalid  fibe_9.8.7_linux_amd64.tar.gz' },
    { unavailable: true }, { httpError: true }, { commit: 'main' },
    { release: { prerelease: true } }, { release: { draft: true } }, { release: { tag_name: 'v9.8.7-rc.1' } },
  ]) await assert.rejects(resolveCliBuild({}, releaseFixture(options).fetchRelease));
  await assert.rejects(resolveCliBuild({ FIBE_CLI_VERSION: '9.8.6' }, releaseFixture().fetchRelease), /requested/);
});

test('candidate build refuses missing or mismatched immutable inputs before publication', async () => {
  const f = fixture();
  try {
    for (const key of ['FIBE_SDK_SHA', 'FIBE_CLI_BINARY_SHA256', 'FIBE_CLI_BINARY_PATH']) {
      await assert.rejects(resolveCliBuild({ ...f.env, [key]: undefined }));
    }
    await assert.rejects(resolveCliBuild({ ...f.env, FIBE_CLI_VERSION: '0.3.0' }), /prerelease/);
    await assert.rejects(resolveCliBuild({ ...f.env, FIBE_CLI_VERSION: '0.3.0-rc.1+wrong' }), /metadata/);
    await assert.rejects(resolveCliBuild({ ...f.env, FIBE_CANDIDATE_PLATFORM: 'linux/riscv64' }), /platform/);
    const wrongChecksum = await resolveCliBuild({ ...f.env, FIBE_CLI_BINARY_SHA256: 'f'.repeat(64) });
    assert.throws(() => stageCandidateCli(wrongChecksum, f.directory), /SHA-256 mismatch/);
    const wrongArch = await resolveCliBuild({ ...f.env, FIBE_CANDIDATE_PLATFORM: 'linux/arm64' });
    assert.throws(() => stageCandidateCli(wrongArch, f.directory), /architecture/);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('candidate binary staging verifies actual bytes on each architecture and retains the binary', async () => {
  for (const arch of ['amd64', 'arm64']) {
    const f = fixture(arch);
    try {
      const build = await resolveCliBuild(f.env, () => { throw new Error('candidate must not use the network'); });
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
