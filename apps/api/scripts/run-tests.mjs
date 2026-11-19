import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';

// Runs every API test file in its own Bun process. Files run through a small
// worker pool, a failed file is retried once (a pass on retry is reported as
// FLAKY), every file runs even after a failure, and the run fails only when a
// file fails twice.
//
// Usage: node scripts/run-tests.mjs [path-substring ...]
// API_TEST_CONCURRENCY sets the number of parallel Bun processes (default 2).

const root = process.cwd();
const srcRoot = join(root, 'src');
const testPattern = /\.(test|spec)\.ts$/;
const defaultConcurrency = 2;

function walk(dir) {
  const entries = readdirSync(dir).sort();
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walk(path));
    } else if (testPattern.test(entry)) {
      files.push(path);
    }
  }

  return files;
}

function parseConcurrency(value) {
  if (value === undefined || value.trim() === '') {
    return defaultConcurrency;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(`API_TEST_CONCURRENCY must be a positive integer, got "${value}".`);
    process.exit(1);
  }
  return parsed;
}

function formatDuration(ms) {
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}m ${seconds}s`;
}

function describeExit(attempt) {
  if (attempt.error) {
    return attempt.error;
  }
  if (attempt.signal) {
    return `signal ${attempt.signal}`;
  }
  return `exit code ${attempt.code ?? 1}`;
}

const filters = process.argv.slice(2);
const allFiles = walk(srcRoot).map((path) => relative(root, path));
const files = filters.length === 0 ? allFiles : allFiles.filter((file) => filters.some((filter) => file.includes(filter)));

if (allFiles.length === 0) {
  console.error('No API test files found under src/.');
  process.exit(1);
}

if (files.length === 0) {
  console.error(`No API test files match: ${filters.join(', ')}`);
  process.exit(1);
}

const concurrency = Math.min(parseConcurrency(process.env.API_TEST_CONCURRENCY), files.length);
const children = new Set();

function runAttempt(file) {
  return new Promise((resolve) => {
    const started = performance.now();
    const chunks = [];
    let settled = false;
    const child = spawn('bun', ['test', '--preload', './test-setup.ts', file], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);

    const finish = (outcome) => {
      if (settled) {
        return;
      }
      settled = true;
      children.delete(child);
      resolve({
        ...outcome,
        ok: !outcome.error && !outcome.signal && outcome.code === 0,
        durationMs: performance.now() - started,
        output: Buffer.concat(chunks).toString('utf8'),
      });
    };

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => finish({ code: 1, signal: null, error: error.message }));
    child.on('close', (code, signal) => finish({ code, signal, error: null }));
  });
}

// Output is buffered per attempt and printed as one block so parallel files
// do not interleave.
function printAttempt(file, attemptNumber, attempt) {
  const label = attemptNumber === 1 ? file : `${file} (retry)`;
  const verdict = attempt.ok ? 'passed' : `failed with ${describeExit(attempt)}`;
  process.stdout.write(`\n== ${label} ==\n`);
  if (attempt.output) {
    process.stdout.write(attempt.output.endsWith('\n') ? attempt.output : `${attempt.output}\n`);
  }
  process.stdout.write(`-- ${label} ${verdict} in ${formatDuration(attempt.durationMs)}\n`);
}

async function runFile(file) {
  // Output is buffered until a file finishes, so a START line without its
  // result block is what identifies a file that hangs.
  console.log(`START ${file}`);
  const first = await runAttempt(file);
  printAttempt(file, 1, first);
  if (first.ok) {
    return { file, status: 'passed', durationMs: first.durationMs };
  }

  console.log(`RETRY ${file} (first attempt ${describeExit(first)})`);
  const second = await runAttempt(file);
  printAttempt(file, 2, second);
  const durationMs = first.durationMs + second.durationMs;
  if (second.ok) {
    console.log(`FLAKY ${file}`);
    return { file, status: 'flaky', durationMs };
  }
  return { file, status: 'failed', durationMs, reason: describeExit(second) };
}

function stopChildren(signal) {
  for (const child of children) {
    child.kill(signal);
  }
  process.exit(signal === 'SIGINT' ? 130 : 143);
}

process.on('SIGINT', () => stopChildren('SIGINT'));
process.on('SIGTERM', () => stopChildren('SIGTERM'));

console.log(`Running ${files.length} API test files in isolated Bun processes, ${concurrency} at a time.`);

const runStarted = performance.now();
const queue = [...files];
const results = [];

async function worker() {
  while (queue.length > 0) {
    const file = queue.shift();
    results.push(await runFile(file));
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const passed = results.filter((result) => result.status === 'passed');
const flaky = results.filter((result) => result.status === 'flaky').sort((a, b) => a.file.localeCompare(b.file));
const failed = results.filter((result) => result.status === 'failed').sort((a, b) => a.file.localeCompare(b.file));

console.log('\nAPI test file durations (slowest first):');
for (const result of [...results].sort((a, b) => b.durationMs - a.durationMs)) {
  console.log(`${formatDuration(result.durationMs).padStart(9)}  ${result.status.padEnd(6)}  ${result.file}`);
}

console.log(
  `\nAPI test summary: ${results.length} files, ${passed.length} passed, ${flaky.length} flaky, ${failed.length} failed in ${formatDuration(performance.now() - runStarted)} with ${concurrency} worker(s).`,
);
for (const result of flaky) {
  console.log(`FLAKY ${result.file}`);
}
for (const result of failed) {
  console.log(`FAILED ${result.file} (failed twice, last ${result.reason})`);
}

// exitCode instead of process.exit lets buffered output to a pipe drain.
process.exitCode = failed.length > 0 ? 1 : 0;
