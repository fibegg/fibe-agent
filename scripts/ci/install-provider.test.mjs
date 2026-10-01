import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installationPlan } from '../install-provider.mjs';

const dependencies = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).dependencies;
const versions = JSON.parse(readFileSync(new URL('../provider-versions.json', import.meta.url)));

test('all shipped npm providers use exact package pins on both image architectures', () => {
  for (const arch of ['x64', 'arm64']) {
    for (const provider of ['gemini', 'claude_code', 'openai_codex', 'opencode']) {
      assert.match(installationPlan(provider, arch, dependencies, versions).npm, /@\d+\.\d+\.\d+$/);
    }
  }
});

test('missing or floating dependency fails instead of silently installing latest', () => {
  for (const version of [undefined, '^0.159.2', 'latest', '0.159.2-beta.1']) {
    assert.throws(() => installationPlan('openai_codex', 'x64', { '@openai/codex': version }, versions), /exact stable version/);
  }
});

test('binary download plans preserve each architecture and vendor integrity data', () => {
  for (const arch of ['x64', 'arm64']) {
    const cursor = installationPlan('cursor', arch, dependencies, versions);
    assert.match(cursor.url, new RegExp(`/linux/${arch}/`));
    assert.ok(cursor.url.includes(versions.cursor.version));
    const agy = installationPlan('antigravity', arch, dependencies, versions);
    assert.equal(agy.sha512.length, 128);
    assert.match(agy.url, arch === 'x64' ? /linux-x64/ : /linux-arm/);
  }
  assert.notEqual(versions.antigravity.linux.x64.sha512, versions.antigravity.linux.arm64.sha512);
});

test('unsupported provider or architecture stops the build', () => {
  assert.throws(() => installationPlan('typo', 'arm64', dependencies, versions), /Unsupported provider/);
  assert.throws(() => installationPlan('gemini', 'riscv64', dependencies, versions), /Unsupported architecture/);
  assert.deepEqual(installationPlan('mock', 'arm64', dependencies, versions), { provider: 'mock' });
});

test('both image recipes use the shared installer and shipped binary directory', () => {
  for (const filename of ['Dockerfile', 'Dockerfile.dev']) {
    const source = readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8');
    assert.match(source, /node scripts\/install-provider\.mjs "\$AGENT_PROVIDER"/);
    assert.match(source, /--from=cli \/usr\/local\/share\/cursor-agent \/usr\/local\/share\/cursor-agent/);
    assert.doesNotMatch(source, /cursor\.com\/install|antigravity\.google\/cli\/install\.sh|CLAUDE_VER=|CODEX_VER=|OPENCODE_VER=/);
  }
});

test('Fibe CLI release pin is present in both runtime recipes and publication metadata', () => {
  for (const filename of ['Dockerfile', 'Dockerfile.dev']) {
    const source = readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8');
    assert.ok(source.includes(`ARG FIBE_CLI_VERSION=${versions.fibeCli.version}`));
  }
  for (const filename of ['build-provider.mjs', 'build-common.mjs']) {
    const source = readFileSync(new URL(filename, import.meta.url), 'utf8');
    assert.ok(source.includes('FIBE_CLI_VERSION=${fibeCliVersion}'));
    assert.ok(source.includes('gg.fibe.cli.version=${fibeCliVersion}'));
  }
});
