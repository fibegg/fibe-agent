import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const wrapper = fileURLToPath(new URL('../chrome-sandbox-wrapper.sh', import.meta.url));
const systemReadlink = spawnSync('sh', ['-c', 'command -v readlink'], { encoding: 'utf8' }).stdout.trim();
const ARGS = ['--headless=new', '--screenshot=/tmp/shot one.png', 'a "quoted" arg', '', '$HOME *', 'line\nbreak', 'about:blank'];

// Installs the wrapper the way the Dockerfiles do: <dir>/chrome is the wrapper
// and <dir>/chrome.real is the browser (a recorder that prints its argv).
function fixture({ unshare = 'denied', uid = '1000', withUnshare = true, realIsLink = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'fibe-chrome-wrapper-'));
  const browserDir = path.join(root, 'opt', 'google', 'chrome'); mkdirSync(browserDir, { recursive: true });
  const bin = path.join(root, 'bin'); mkdirSync(bin);
  const browser = path.join(browserDir, 'chrome');
  copyFileSync(wrapper, browser);
  chmodSync(browser, 0o755);
  const recorder = `#!/bin/sh\nfor arg in "$@"; do printf '%s\\0' "$arg"; done\nexit "\${FIXTURE_EXIT:-0}"\n`;
  if (realIsLink) {
    // arm64: /opt/google/chrome/chrome.real is a link to Debian's /usr/bin/chromium.
    const usrBin = path.join(root, 'usr', 'bin'); mkdirSync(usrBin, { recursive: true });
    writeFileSync(path.join(usrBin, 'chromium'), recorder, { mode: 0o755 });
    symlinkSync(path.join(usrBin, 'chromium'), `${browser}.real`);
  } else {
    writeFileSync(`${browser}.real`, recorder, { mode: 0o755 });
  }
  writeFileSync(path.join(bin, 'id'), `#!/bin/sh\necho ${uid}\n`, { mode: 0o755 });
  if (withUnshare) {
    writeFileSync(path.join(bin, 'unshare'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${root}/unshare-calls"\n[ "${unshare}" = ok ]\n`, { mode: 0o755 });
  }
  symlinkSync(systemReadlink, path.join(bin, 'readlink'));
  // PATH holds only the fixture tools, so a host unshare never answers the probe.
  const env = { PATH: bin };
  const run = (args = ARGS, extraEnv = {}, entry = browser) => {
    const result = spawnSync(entry, args, { env: { ...env, ...extraEnv }, encoding: 'utf8' });
    return { ...result, argv: result.stdout.split('\0').slice(0, -1) };
  };
  const probes = () => existsSync(path.join(root, 'unshare-calls')) ? readFileSync(path.join(root, 'unshare-calls'), 'utf8').trim().split('\n') : [];
  return { root, browser, bin, run, probes, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('adds --no-sandbox first when user namespaces are denied and keeps every argument intact', () => {
  const f = fixture({ unshare: 'denied' });
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.argv, ['--no-sandbox', ...ARGS]);
    assert.deepEqual(f.probes(), ['--user --pid --net --fork true']);
  } finally { f.cleanup(); }
});

test('leaves the sandbox to Chrome when user namespaces work', () => {
  const f = fixture({ unshare: 'ok' });
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.argv, ARGS);
    assert.equal(f.probes().length, 1);
  } finally { f.cleanup(); }
});

test('FIBE_CHROME_SANDBOX=1 keeps the sandbox and FIBE_CHROME_SANDBOX=0 always disables it', () => {
  const denied = fixture({ unshare: 'denied' });
  const allowed = fixture({ unshare: 'ok' });
  try {
    assert.deepEqual(denied.run(ARGS, { FIBE_CHROME_SANDBOX: '1' }).argv, ARGS);
    assert.deepEqual(allowed.run(ARGS, { FIBE_CHROME_SANDBOX: '0' }).argv, ['--no-sandbox', ...ARGS]);
    assert.deepEqual(denied.probes(), []);
    assert.deepEqual(allowed.probes(), []);
  } finally { denied.cleanup(); allowed.cleanup(); }
});

test('an explicit --no-sandbox is passed once and skips the probe', () => {
  const f = fixture({ unshare: 'denied' });
  try {
    const args = ['--headless', '--no-sandbox', 'about:blank'];
    assert.deepEqual(f.run(args).argv, args);
    assert.deepEqual(f.probes(), []);
  } finally { f.cleanup(); }
});

test('root and a missing unshare both run without the sandbox', () => {
  const root = fixture({ unshare: 'ok', uid: '0' });
  const missing = fixture({ withUnshare: false });
  try {
    assert.deepEqual(root.run().argv, ['--no-sandbox', ...ARGS]);
    assert.deepEqual(missing.run().argv, ['--no-sandbox', ...ARGS]);
  } finally { root.cleanup(); missing.cleanup(); }
});

test('finds the browser through a launcher symlink and a linked Chromium, and returns its exit status', () => {
  const f = fixture({ unshare: 'denied', realIsLink: true });
  try {
    const link = path.join(f.bin, 'google-chrome');
    symlinkSync(f.browser, link);
    const result = f.run(['--version'], {}, link);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.argv, ['--no-sandbox', '--version']);
    const failed = f.run(['--version'], { FIXTURE_EXIT: '3' });
    assert.equal(failed.status, 3);
    assert.deepEqual(failed.argv, ['--no-sandbox', '--version']);
  } finally { f.cleanup(); }
});
