import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildReport, collectPins, compareVersions, formatReport, parseArgs } from '../provider-pins-report.mjs';

const script = fileURLToPath(new URL('../provider-pins-report.mjs', import.meta.url));
const hasGit = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const fixturePackage = {
  name: 'fixture',
  private: true,
  dependencies: {
    '@anthropic-ai/claude-agent-sdk': '0.3.10',
    '@anthropic-ai/claude-code': '2.1.10',
    '@openai/codex': '0.150.0',
    'opencode-ai': '1.18.0',
    '@google/gemini-cli': '0.60.0',
    react: '19.3.0',
  },
};

const fixtureVersions = {
  cursor: { version: '2026.09.28-64d2043', source: 'https://cursor.example/install' },
  antigravity: {
    version: '1.2.14',
    source: 'https://antigravity.example/install.sh',
    linux: {
      x64: { url: 'https://downloads.example/1.2.14/x64.tar.gz', sha512: 'a'.repeat(128) },
      arm64: { url: 'https://downloads.example/1.2.14/arm64.tar.gz', sha512: 'b'.repeat(128) },
    },
  },
};

const fixtureApiPackage = { name: 'fixture-api', private: true, dependencies: { '@anthropic-ai/claude-agent-sdk': '0.3.9' } };

function fixture(dependencies = fixturePackage.dependencies) {
  const root = mkdtempSync(path.join(tmpdir(), 'fibe-provider-pins-'));
  mkdirSync(path.join(root, 'scripts'));
  mkdirSync(path.join(root, 'apps/api'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ ...fixturePackage, dependencies }, null, 2)}\n`);
  writeFileSync(path.join(root, 'apps/api/package.json'), `${JSON.stringify(fixtureApiPackage, null, 2)}\n`);
  writeFileSync(path.join(root, 'scripts/provider-versions.json'), `${JSON.stringify(fixtureVersions, null, 2)}\n`);
  return root;
}

function digest(root) {
  const hash = createHash('sha256');
  for (const file of ['package.json', 'apps/api/package.json', 'scripts/provider-versions.json']) hash.update(readFileSync(path.join(root, file)));
  return hash.digest('hex');
}

function git(root, args, date) {
  // Inherited GIT_DIR or GIT_WORK_TREE would point the fixture commands at another repository.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  Object.assign(env, { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  const result = spawnSync(
    'git',
    ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { env, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
}

test('every installer npm provider and the bundled Agent SDK are reported with their pins', () => {
  const root = fixture();
  try {
    const pins = collectPins(root);
    const byPackage = Object.fromEntries(pins.map((pin) => [pin.package, pin]));
    assert.equal(byPackage['@anthropic-ai/claude-code'].pinned, '2.1.10');
    assert.equal(byPackage['@anthropic-ai/claude-agent-sdk'].provider, 'claude-code');
    assert.equal(byPackage['@openai/codex'].pinned, '0.150.0');
    assert.equal(byPackage['opencode-ai'].pinned, '1.18.0');
    assert.equal(byPackage['@google/gemini-cli'].pinned, '0.60.0');
    assert.equal(pins.find((pin) => pin.provider === 'cursor').pinned, '2026.09.28-64d2043');
    assert.equal(pins.find((pin) => pin.provider === 'antigravity').pinned, '1.2.14');
    assert.ok(!pins.some((pin) => pin.package === 'react'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('offline mode never queries the registry and marks npm pins as not checked', () => {
  const root = fixture();
  try {
    const rows = buildReport({
      root,
      offline: true,
      lookupLatest: () => assert.fail('registry lookup in offline mode'),
      pinDate: () => null,
    });
    for (const row of rows.filter((row) => row.file.endsWith('package.json'))) {
      assert.equal(row.status, 'not checked');
      assert.equal(row.latest, null);
    }
    for (const row of rows.filter((row) => !row.file.endsWith('package.json'))) assert.equal(row.status, 'check installer');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('registry results classify pins as current, behind, ahead or unknown', () => {
  const root = fixture();
  try {
    const latest = { '@anthropic-ai/claude-code': '2.1.10', '@openai/codex': '0.170.0', 'opencode-ai': '1.17.9' };
    const looked = [];
    const rows = buildReport({
      root,
      lookupLatest: (name) => {
        looked.push(name);
        return latest[name] ?? null;
      },
      pinDate: () => null,
    });
    const status = Object.fromEntries(rows.map((row) => [row.package, row.status]));
    assert.equal(status['@anthropic-ai/claude-code'], 'current');
    assert.equal(status['@openai/codex'], 'behind');
    assert.equal(status['opencode-ai'], 'ahead');
    assert.equal(status['@google/gemini-cli'], 'unknown');
    assert.ok(!looked.some((name) => name.startsWith('https://')), 'installer-based providers are not looked up on npm');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the API runtime Agent SDK pin is reported beside the workspace pin', () => {
  const root = fixture();
  try {
    const rows = buildReport({
      root,
      lookupLatest: (name) => (name === '@anthropic-ai/claude-agent-sdk' ? '0.3.10' : null),
      pinDate: () => null,
    }).filter((row) => row.package === '@anthropic-ai/claude-agent-sdk');
    const byFile = Object.fromEntries(rows.map((row) => [row.file, row]));
    assert.equal(rows.length, 2);
    assert.equal(byFile['package.json'].pinned, '0.3.10');
    assert.equal(byFile['package.json'].status, 'current');
    assert.equal(byFile['apps/api/package.json'].pinned, '0.3.9');
    assert.equal(byFile['apps/api/package.json'].status, 'behind');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing pin is reported instead of failing the report', () => {
  const dependencies = { ...fixturePackage.dependencies };
  delete dependencies['@openai/codex'];
  const root = fixture(dependencies);
  try {
    const row = buildReport({ root, offline: true, pinDate: () => null }).find((row) => row.package === '@openai/codex');
    assert.equal(row.pinned, null);
    assert.equal(row.status, 'missing pin');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pin age comes from the commit that introduced the current pin', { skip: !hasGit && 'git is not installed' }, () => {
  const root = fixture();
  try {
    git(root, ['init', '-q'], '2026-09-01T00:00:00Z');
    git(root, ['add', '.'], '2026-09-01T00:00:00Z');
    git(root, ['commit', '-q', '-m', 'initial pins'], '2026-09-01T00:00:00Z');
    const updated = { ...fixturePackage.dependencies, '@openai/codex': '0.159.3' };
    writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ ...fixturePackage, dependencies: updated }, null, 2)}\n`);
    git(root, ['commit', '-q', '-am', 'bump codex'], '2026-10-01T00:00:00Z');

    const rows = buildReport({ root, offline: true, now: new Date('2026-11-19T00:00:00Z') });
    const byPackage = Object.fromEntries(rows.map((row) => [row.package, row]));
    assert.equal(byPackage['@openai/codex'].pinnedSince, '2026-10-01');
    assert.equal(byPackage['@openai/codex'].ageDays, 49);
    assert.equal(byPackage['@google/gemini-cli'].pinnedSince, '2026-09-01');
    assert.equal(byPackage['@google/gemini-cli'].ageDays, 79);
    assert.equal(rows.find((row) => row.provider === 'antigravity').pinnedSince, '2026-09-01');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the command line report is read-only and works offline outside a git repository', () => {
  const root = fixture();
  try {
    const before = digest(root);
    const text = spawnSync(process.execPath, [script, '--offline', '--root', root], { encoding: 'utf8' });
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^Provider\s+Package\s+Pinned\s+Latest\s+Status/);
    assert.match(text.stdout, /@openai\/codex\s+0\.150\.0\s+-\s+not checked\s+unknown/);

    const json = spawnSync(process.execPath, [script, '--offline', '--json', '--root', root], { encoding: 'utf8' });
    assert.equal(json.status, 0, json.stderr);
    const rows = JSON.parse(json.stdout);
    assert.equal(rows.find((row) => row.package === '@anthropic-ai/claude-agent-sdk').pinned, '0.3.10');
    assert.equal(digest(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('arguments are validated', () => {
  assert.deepEqual(parseArgs(['--offline', '--json', '--root', '/x']), { offline: true, json: true, root: '/x', help: false });
  assert.throws(() => parseArgs(['--root']), /--root needs a directory/);
  assert.throws(() => parseArgs(['--write']), /Unknown argument/);
  const result = spawnSync(process.execPath, [script, '--bogus'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});

test('versions compare numerically and the table aligns every row', () => {
  assert.equal(compareVersions('0.159.3', '0.170.0'), -1);
  assert.equal(compareVersions('2.1.328', '2.1.286'), 1);
  assert.equal(compareVersions('1.19.6', '1.19.6'), 0);
  assert.equal(compareVersions('1.0.0-beta', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0-beta.2', '1.0.0-beta.10'), -1);
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0-beta'), 1);
  const table = formatReport([
    { provider: 'gemini', package: '@google/gemini-cli', pinned: '0.62.0', latest: '0.69.0', status: 'behind', pinnedSince: '2026-10-01', ageDays: 49, file: 'package.json' },
    { provider: 'cursor', package: 'https://cursor.example/install', pinned: '2026.09.28-64d2043', latest: null, status: 'check installer', pinnedSince: null, ageDays: null, file: 'scripts/provider-versions.json' },
  ]).split('\n');
  assert.equal(table.length, 4);
  assert.equal(table[2].indexOf('0.62.0'), table[0].indexOf('Pinned'));
  assert.equal(table[3].indexOf('check installer'), table[0].indexOf('Status'));
});
