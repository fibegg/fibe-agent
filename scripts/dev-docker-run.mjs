import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Docker/Mutagen development runner. Local development should use Nx directly
// via `bun run dev`; this path avoids stale API children inside containers.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const children = new Set();
let shuttingDown = false;

function bin(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return join(root, 'node_modules', '.bin', `${name}${suffix}`);
}

function spawnChild(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`[dev] ${name} exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
      void shutdown(code || 1);
    }
  });
  return child;
}

function stopChild(child) {
  if (child.killed || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!child.killed && child.exitCode === null) child.kill('SIGKILL');
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.all([...children].map(stopChild));
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(130));
process.on('SIGTERM', () => void shutdown(143));

spawnChild('api', process.execPath, [join(root, 'scripts', 'dev-docker-api-watch.mjs')]);
spawnChild('chat', bin('vite'), [], { cwd: join(root, 'apps', 'chat') });
