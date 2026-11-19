import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { failurePayload, redactSecrets } from './diagnostics.mjs';

const notifier = fileURLToPath(new URL('./notify.mjs', import.meta.url));

test('a successful upload retains sanitized failure evidence in archived notifier logs', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'fibe-ci-notify-'));
  try {
    const token = 'diagnostic-fixture-github-token';
    const headerToken = 'unconfigured-fixture-header-token';
    const output = `Assertion failed in persistence.test.ts:44: expect(received).toEqual(expected)\ncredential=${token}\nAuthorization: Bearer ${headerToken}\n`;
    await writeFile(path.join(fixture, 'ci-test.json'), JSON.stringify({
      service: 'ci-test', status: 'failed', exit_code: 1,
      output_base64: Buffer.from(output).toString('base64'),
    }));
    const capture = path.join(fixture, 'requests.json');
    const preload = path.join(fixture, 'fetch.mjs');
    await writeFile(preload, `
      import { writeFileSync } from 'node:fs';
      const requests = [];
      globalThis.fetch = async (url, options) => {
        requests.push({ url, body: options.body instanceof FormData ? options.body.get('content') : options.body });
        writeFileSync(process.env.CI_NOTIFICATION_TEST_OUT, JSON.stringify(requests));
        return new Response(url === 'https://dpaste.com/api/v2/' ? 'https://dpaste.invalid/failure' : '', { status: 200 });
      };
    `);
    const child = spawnSync(process.execPath, ['--import', preload, notifier], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        CI_RESULTS_DIR: fixture,
        CI_EXPECTED_STEPS: 'ci-test',
        FIBE_BRANCH: 'main',
        GH_TOKEN: token,
        DPASTE_TOKEN: 'diagnostic-fixture-upload-token',
        SLACK_WEBHOOK_URL: 'https://hooks.slack.invalid/diagnostic-fixture',
        CI_NOTIFICATION_TEST_OUT: capture,
      },
    });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stdout, /Begin CI Failure Payload/);
    assert.match(child.stdout, /persistence\.test\.ts:44/);
    assert.doesNotMatch(child.stdout, new RegExp(token));
    assert.doesNotMatch(child.stdout, new RegExp(headerToken));
    const requests = JSON.parse(await readFile(capture, 'utf8'));
    assert.equal(requests.length, 2);
    assert.match(requests[0].body, /persistence\.test\.ts:44/);
    assert.doesNotMatch(requests[0].body, new RegExp(token));
    assert.doesNotMatch(requests[0].body, new RegExp(headerToken));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('diagnostics redact configured secrets and nested configuration values', () => {
  const secret = 'fixture-key-with-"quote"\nand-newline';
  const nested = 'fixture-nested-password';
  const key = '-----BEGIN PRIVATE KEY-----\nfixture-private-key-content\n-----END PRIVATE KEY-----';
  const text = [secret, JSON.stringify(secret).slice(1, -1), Buffer.from(secret).toString('base64'), nested, key, JSON.stringify(key).slice(1, -1), Buffer.from(key).toString('base64')].join('\n');
  const safe = redactSecrets(text, { GH_TOKEN: secret, K3S_SSH_PRIVATE_KEY: key, FIBE_SETTINGS_JSON: JSON.stringify({ agentPassword: nested }) });
  assert.equal(safe, Array(7).fill('[REDACTED]').join('\n'));
});

test('a multiline secret crossing the retained-line boundary cannot leak', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'fibe-ci-notify-'));
  try {
    const key = '-----BEGIN PRIVATE KEY-----\nfixture-private-line-one\nfixture-private-line-two\n-----END PRIVATE KEY-----';
    const output = 'setup\n' + key + '\n' + 'remaining log\n'.repeat(995) + 'final assertion marker\n';
    await writeFile(path.join(fixture, 'ci-test.json'), JSON.stringify({
      service: 'ci-test', status: 'failed', exit_code: 1,
      output_base64: Buffer.from(output).toString('base64'),
    }));
    const child = spawnSync(process.execPath, [notifier], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, CI_RESULTS_DIR: fixture, CI_EXPECTED_STEPS: 'ci-test', K3S_SSH_PRIVATE_KEY: key },
    });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stdout, /final assertion marker/);
    assert.equal(/fixture-private-line|END PRIVATE KEY/.test(child.stdout), false, 'A retained-line boundary must not expose any private-key fragment');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('generic authorization headers and bearer values are redacted without configured secrets', () => {
  const safe = redactSecrets('Authorization: Bearer fixture-header-token\n{"Authorization":"Basic Zml4dHVyZTpzZWNyZXQ="}\nAuthorization: fixture-plain-token\nBearer fixture-standalone-token', {});
  assert.doesNotMatch(safe, /fixture-header-token|Zml4dHVyZTpzZWNyZXQ=|fixture-plain-token|fixture-standalone-token/);
  assert.match(safe, /\[REDACTED\]/);
});

test('failure reports remain bounded and retain the final assertion', () => {
  const safe = failurePayload('ci-test failed\n' + 'older output 🐝\n'.repeat(1000) + 'final assertion at persistence.test.ts:44', {}, 1024);
  assert.ok(Buffer.byteLength(safe) <= 1024);
  assert.match(safe, /^ci-test failed/);
  assert.match(safe, /Middle CI diagnostics omitted/);
  assert.match(safe, /final assertion at persistence\.test\.ts:44$/);
});

test('the summary shows step durations and lists flaky test files', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'fibe-ci-notify-'));
  try {
    await writeFile(path.join(fixture, 'ci-lint.json'), JSON.stringify({
      service: 'ci-lint', status: 'passed', exit_code: 0, duration_ms: 65_000, waited_ms: 12_000,
      flaky: [], output_base64: '',
    }));
    await writeFile(path.join(fixture, 'ci-test.json'), JSON.stringify({
      service: 'ci-test', status: 'failed', exit_code: 1, duration_ms: 3_725_000, waited_ms: 0,
      flaky: ['src/app/agent-mode/agent-mode.store.service.test.ts'],
      output_base64: Buffer.from('final assertion marker\n').toString('base64'),
    }));
    const child = spawnSync(process.execPath, [notifier], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, CI_RESULTS_DIR: fixture, CI_EXPECTED_STEPS: 'ci-lint ci-test' },
    });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stdout, /- ci-lint: passed \(exit code 0, ran 1m 05s, waited 12s\)/);
    assert.match(child.stdout, /- ci-test: failed \(exit code 1, ran 1h 02m\)/);
    assert.match(child.stdout, /Flaky tests \(failed once, passed on retry\):\n- ci-test: FLAKY src\/app\/agent-mode\/agent-mode\.store\.service\.test\.ts/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('results written before durations existed still render', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'fibe-ci-notify-'));
  try {
    await writeFile(path.join(fixture, 'ci-test.json'), JSON.stringify({
      service: 'ci-test', status: 'failed', exit_code: 1, output_base64: '',
    }));
    const child = spawnSync(process.execPath, [notifier], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, CI_RESULTS_DIR: fixture, CI_EXPECTED_STEPS: 'ci-test' },
    });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stdout, /- ci-test: failed \(exit code 1\)\n/);
    assert.doesNotMatch(child.stdout, /Flaky tests/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
