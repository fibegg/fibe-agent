import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs the API in Docker/Mutagen dev mode. Webpack watches the synced source
// tree, and this wrapper starts exactly one API process after each clean build.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiRoot = join(root, 'apps', 'api');
const distDir = join(apiRoot, 'dist');
const distMain = join(distDir, 'main.js');
const restartGraceMs = Number(process.env.DEV_API_RESTART_GRACE_MS || 3000);

let webpackProcess;
let serverProcess;
let shuttingDown = false;
let restartTimer;
let restartInProgress = false;
let restartQueued = false;
const stoppingProcesses = new WeakMap();
const expectedServerExits = new WeakSet();

function bin(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return join(root, 'node_modules', '.bin', `${name}${suffix}`);
}

function spawnChild(command, args, options = {}) {
  const { env = {}, ...spawnOptions } = options;
  return spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ...env,
    },
    ...spawnOptions,
  });
}

async function ensureProjectGraphCache() {
  const { createProjectGraphAsync } = await import('nx/src/project-graph/project-graph.js');
  await createProjectGraphAsync({ exitOnError: false, resetDaemonClient: false });
}

function stopProcess(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  const existingStop = stoppingProcesses.get(child);
  if (existingStop) return existingStop;

  const stopPromise = new Promise((resolve) => {
    const killTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, restartGraceMs);

    child.once('exit', () => {
      clearTimeout(killTimer);
      stoppingProcesses.delete(child);
      resolve();
    });
    child.kill(signal);
  });

  stoppingProcesses.set(child, stopPromise);
  return stopPromise;
}

async function restartServerOnce() {
  if (shuttingDown || !existsSync(distMain)) return;

  const previousServer = serverProcess;
  if (previousServer) expectedServerExits.add(previousServer);
  await stopProcess(previousServer);
  if (serverProcess === previousServer) serverProcess = undefined;
  if (shuttingDown || !existsSync(distMain)) return;

  const nextServer = spawnChild(process.execPath, [distMain], { cwd: root });
  serverProcess = nextServer;
  nextServer.on('exit', (code, signal) => {
    const expectedExit = expectedServerExits.has(nextServer);
    expectedServerExits.delete(nextServer);
    if (serverProcess === nextServer) serverProcess = undefined;
    if (!shuttingDown && !expectedExit && code !== 0) {
      console.error(`[dev-api] server exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
    }
  });
}

async function restartServer() {
  if (restartInProgress) {
    restartQueued = true;
    return;
  }

  restartInProgress = true;
  try {
    do {
      restartQueued = false;
      await restartServerOnce();
    } while (restartQueued && !shuttingDown);
  } finally {
    restartInProgress = false;
  }
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartServer().catch((error) => {
      console.error(`[dev-api] failed to restart server: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, 250);
}

function handleWebpackOutput(chunk, stream) {
  const text = chunk.toString();
  stream.write(text);

  const plain = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  if (plain.match(/webpack compiled (successfully|with \d+ warnings?)/i)) {
    scheduleRestart();
  }
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(restartTimer);
  await Promise.all([
    stopProcess(serverProcess),
    stopProcess(webpackProcess),
  ]);
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(130));
process.on('SIGTERM', () => void shutdown(143));

rmSync(distDir, { recursive: true, force: true });

try {
  await ensureProjectGraphCache();
} catch (error) {
  console.error(`[dev-api] failed to create Nx project graph: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

webpackProcess = spawnChild(bin('webpack-cli'), ['build', '--node-env=development', '--watch'], {
  cwd: apiRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    NX_BUILD_TARGET: 'api:build:development',
  },
});
webpackProcess.stdout?.on('data', (chunk) => handleWebpackOutput(chunk, process.stdout));
webpackProcess.stderr?.on('data', (chunk) => handleWebpackOutput(chunk, process.stderr));
webpackProcess.on('exit', (code, signal) => {
  if (!shuttingDown) {
    console.error(`[dev-api] webpack exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
    void shutdown(code || 1);
  }
});
