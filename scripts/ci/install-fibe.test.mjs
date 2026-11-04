import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const installer = fileURLToPath(new URL('../install-fibe.sh', import.meta.url));
function fixture(options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'fibe-install-checksum-'));
  const bin = path.join(root, 'bin'); mkdirSync(bin);
  const temp = path.join(root, 'tmp'); mkdirSync(temp);
  const archive = 'synthetic-sdk-release-archive';
  const sha = createHash('sha256').update(archive).digest('hex');
  const pin = path.join(root, 'pins.json');
  writeFileSync(pin, JSON.stringify({ fibeCli: { version: '9.8.7', linuxArchiveSha256: options.missingPin ? {} : { amd64: sha, arm64: sha } } }));
  const env = {
    PATH: `${bin}:${process.env.PATH}`, TMPDIR: temp,
    FIBE_CLI_VERSION: options.version ?? '9.8.7', FIBE_CLI_PIN_FILE: pin,
    FIBE_INSTALL_DIR: path.join(root, 'installed'), FIXTURE_ROOT: root,
    FIXTURE_ARCH: options.arch || 'x86_64', FIXTURE_ARCHIVE: options.corrupt ? 'corrupted bytes' : archive,
    FIXTURE_TAG: options.tag || `v${options.version && options.version !== 'latest' ? options.version : '9.8.7'}`,
    FIXTURE_CHECKSUMS: options.checksums ?? 'match', FIXTURE_SHA: sha,
  };
  function executable(name, source) { writeFileSync(path.join(bin, name), `#!${process.execPath}\n${source}`, { mode: 0o755 }); }
  executable('uname', "console.log(process.env.FIXTURE_ARCH);");
  executable('curl', `
const fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2);
fs.appendFileSync(path.join(process.env.FIXTURE_ROOT, 'requests'), 'request\\n');
const destination = args[args.indexOf('-o') + 1];
const url = args.find((arg) => arg.startsWith('https://'));
fs.appendFileSync(path.join(process.env.FIXTURE_ROOT, 'urls'), url + '\\n');
const version = process.env.FIXTURE_TAG.slice(1);
if (url.includes('/releases/tags/') || url.endsWith('/releases/latest')) {
  const assets = ['amd64','arm64'].map(arch => ({name:'fibe_'+version+'_linux_'+arch+'.tar.gz',url:'https://fixture.invalid/api/'+arch,browser_download_url:'https://fixture.invalid/archive/'+arch}));
  if (process.env.FIXTURE_CHECKSUMS !== 'absent') assets.push({name:'checksums.txt',url:'https://fixture.invalid/api/checksums',browser_download_url:'https://fixture.invalid/checksums'});
  fs.writeFileSync(destination, JSON.stringify({tag_name:process.env.FIXTURE_TAG, assets}));
} else if (url.endsWith('/checksums')) {
  const sha = process.env.FIXTURE_CHECKSUMS === 'wrong' ? '0'.repeat(64) : process.env.FIXTURE_SHA;
  fs.writeFileSync(destination, ['amd64','arm64'].map(arch => sha + '  fibe_' + version + '_linux_' + arch + '.tar.gz').join('\\n') + '\\n');
} else fs.writeFileSync(destination, process.env.FIXTURE_ARCHIVE);
`);
  executable('tar', `require('node:fs').writeFileSync(require('node:path').join(process.env.FIBE_INSTALL_DIR, 'fibe'), 'fixture executable');`);
  return { root, env, run: () => spawnSync('/bin/sh', [installer], { env, encoding: 'utf8' }), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('stable install verifies source-pinned archive bytes on both architectures before extraction', () => {
  for (const arch of ['x86_64', 'aarch64']) {
    const f = fixture({ arch });
    try {
      const result = f.run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(path.join(f.env.FIBE_INSTALL_DIR, 'fibe'), 'utf8'), 'fixture executable');
    } finally { f.cleanup(); }
  }
});
test('corrupt archive is rejected before the install directory is created', () => {
  const f = fixture({ corrupt: true });
  try {
    assert.notEqual(f.run().status, 0);
    assert.equal(existsSync(f.env.FIBE_INSTALL_DIR), false);
  } finally { f.cleanup(); }
});
test('a missing pin for the pinned version and unsupported architectures fail before downloading', () => {
  for (const options of [{ missingPin: true }, { arch: 'riscv64' }]) {
    const f = fixture(options);
    try {
      assert.notEqual(f.run().status, 0);
      assert.equal(existsSync(path.join(f.root, 'requests')), false);
      assert.equal(existsSync(f.env.FIBE_INSTALL_DIR), false);
    } finally { f.cleanup(); }
  }
});
test('a release response for another tag is rejected before archive download', () => {
  const f = fixture({ tag: 'v9.8.8' });
  try {
    assert.notEqual(f.run().status, 0);
    assert.equal(readFileSync(path.join(f.root, 'requests'), 'utf8').trim().split('\n').length, 1);
    assert.equal(existsSync(f.env.FIBE_INSTALL_DIR), false);
  } finally { f.cleanup(); }
});

function urls(f) {
  return readFileSync(path.join(f.root, 'urls'), 'utf8').trim().split('\n');
}
test('another version installs after matching the checksums its release publishes', () => {
  const f = fixture({ version: '9.9.0' });
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.ok(urls(f)[0].endsWith('/releases/tags/v9.9.0'));
    assert.ok(urls(f).includes('https://fixture.invalid/checksums'));
    assert.equal(readFileSync(path.join(f.env.FIBE_INSTALL_DIR, 'fibe'), 'utf8'), 'fixture executable');
  } finally { f.cleanup(); }
});
test('another version is rejected when its published checksum differs or is missing', () => {
  for (const checksums of ['wrong', 'absent']) {
    const f = fixture({ version: '9.9.0', checksums });
    try {
      assert.notEqual(f.run().status, 0);
      assert.equal(existsSync(f.env.FIBE_INSTALL_DIR), false);
    } finally { f.cleanup(); }
  }
});
test('latest resolves the newest release and verifies it', () => {
  for (const version of ['', 'latest']) {
    const f = fixture({ version, tag: 'v9.9.1' });
    try {
      const result = f.run();
      assert.equal(result.status, 0, result.stderr);
      assert.ok(urls(f)[0].endsWith('/releases/latest'));
      assert.ok(urls(f).includes('https://fixture.invalid/checksums'));
    } finally { f.cleanup(); }
  }
});
test('latest equal to the pinned version uses the source pin', () => {
  const f = fixture({ version: 'latest', tag: 'v9.8.7', checksums: 'absent' });
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(urls(f).includes('https://fixture.invalid/checksums'), false);
  } finally { f.cleanup(); }
});
