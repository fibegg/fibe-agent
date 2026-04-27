import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { isBlank } from './lib.mjs';

const serviceName = process.env.CI_STEP_NAME || process.argv[2] || 'ci-step';
const resultsDir = process.env.CI_RESULTS_DIR || '/results';
const resultFile = path.join(resultsDir, `${serviceName}.json`);
const maxCaptureBytes = Number(process.env.CI_CAPTURE_MAX_BYTES || 2_000_000);
const dependencyWaitTimeoutMs = Number(process.env.CI_DEPENDENCY_WAIT_TIMEOUT_MS || 7_200_000);
const dependencyWaitIntervalMs = Number(process.env.CI_DEPENDENCY_WAIT_INTERVAL_MS || 1_000);

function encodeText(value) {
  return Buffer.from(value).toString('base64');
}

async function writeResult(status, exitCode, output = '') {
  await writeFile(
    resultFile,
    `${JSON.stringify({
      service: serviceName,
      status,
      exit_code: exitCode,
      output_base64: encodeText(output),
    })}\n`,
  );
}

async function finishAndKeepAlive() {
  await writeFile('/tmp/ci-done', '');
  setInterval(() => {}, 2 ** 30);
}

async function resultStatus(dependency) {
  const content = await readFile(path.join(resultsDir, `${dependency}.json`), 'utf8');
  return JSON.parse(content).status;
}

async function clearResultsDir() {
  await mkdir(resultsDir, { recursive: true });
  for (const entry of await readdir(resultsDir)) {
    await rm(path.join(resultsDir, entry), { recursive: true, force: true });
  }
}

async function validateRequiredEnvs() {
  const missing = [];
  for (const envName of (process.env.CI_REQUIRED_ENVS || '').split(/\s+/).filter(Boolean)) {
    if (isBlank(process.env[envName])) {
      missing.push(envName);
    }
  }

  if (missing.length === 0) {
    return true;
  }

  const message = `Missing required CI environment variable(s):\n${missing.map((name) => `- ${name}`).join('\n')}`;
  console.log(`--> ${serviceName} failed required environment validation`);
  console.log(message);
  await writeResult('failed', 1, message);
  return false;
}

async function validateRequiredSteps() {
  const requiredSteps = (process.env.CI_REQUIRED_STEPS || '').split(/\s+/).filter(Boolean);
  if (requiredSteps.length === 0) {
    return true;
  }

  const deadline = Date.now() + dependencyWaitTimeoutMs;
  let lastWaitingLog = 0;

  while (Date.now() < deadline) {
    const blocked = [];
    const missing = [];

    for (const dependency of requiredSteps) {
      const dependencyFile = path.join(resultsDir, `${dependency}.json`);
      if (!existsSync(dependencyFile)) {
        missing.push(dependency);
        continue;
      }

      const status = await resultStatus(dependency);
      if (status !== 'passed') {
        blocked.push(`${dependency}: ${status}`);
      }
    }

    if (blocked.length > 0) {
      const message = `Blocked because required CI step(s) did not pass:\n${blocked.map((line) => `- ${line}`).join('\n')}`;
      console.log(`--> ${serviceName} blocked`);
      console.log(message);
      await writeResult('blocked', 0, message);
      return false;
    }

    if (missing.length === 0) {
      return true;
    }

    if (Date.now() - lastWaitingLog > 30_000) {
      console.log(`--> ${serviceName} waiting for required step result(s): ${missing.join(', ')}`);
      lastWaitingLog = Date.now();
    }

    await sleep(dependencyWaitIntervalMs);
  }

  const message = `Blocked because required CI step result(s) were not produced before timeout:\n${requiredSteps.map((step) => `- ${step}`).join('\n')}`;
  console.log(`--> ${serviceName} blocked`);
  console.log(message);
  await writeResult('blocked', 0, message);
  return false;
}

function appendTail(current, chunk) {
  const combined = Buffer.concat([current, chunk]);
  if (combined.length <= maxCaptureBytes) {
    return combined;
  }
  return combined.subarray(combined.length - maxCaptureBytes);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    let captured = Buffer.alloc(0);
    const child = spawn(command, args, { env: process.env, cwd: process.cwd() });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      captured = appendTail(captured, chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      captured = appendTail(captured, chunk);
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({
        code: code ?? 1,
        signal,
        output: captured.toString('utf8'),
      });
    });
  });
}

await rm('/tmp/ci-done', { force: true });
await mkdir(resultsDir, { recursive: true });
if (serviceName === 'ci-setup') {
  await clearResultsDir();
}
await rm(resultFile, { force: true });

if (!(await validateRequiredEnvs()) || !(await validateRequiredSteps())) {
  await finishAndKeepAlive();
} else {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    await writeResult('failed', 1, 'No command was provided to ci-step wrapper');
  } else {
    console.log(`--> Running ${serviceName}: ${[command, ...args].join(' ')}`);
    const result = await runCommand(command, args);

    if (result.code === 0) {
      await writeResult('passed', 0);
      console.log(`--> ${serviceName} passed`);
    } else {
      await writeResult('failed', result.code, result.output);
      const suffix = result.signal ? `signal ${result.signal}` : `exit code ${result.code}`;
      console.log(`--> ${serviceName} failed with ${suffix}`);
    }
  }

  await finishAndKeepAlive();
}
