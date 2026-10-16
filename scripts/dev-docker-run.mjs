import { spawn } from 'node:child_process';
import { stopChild, watcherShutdownGraceMs } from './dev-child-shutdown.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Docker/Mutagen development runner. Local development should use Nx directly
// via `bun run dev`; this path avoids stale API children inside containers.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const children = new Set();
const childShutdownGrace = new WeakMap();
let shuttingDown = false;

function bin(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return join(root, 'node_modules', '.bin', `${name}${suffix}`);
}

function spawnChild(name, command, args, options = {}, shutdownGraceMs = 3000) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
  children.add(child);
  childShutdownGrace.set(child, shutdownGraceMs);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(
        `[dev] ${name} exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`,
      );
      void shutdown(code || 1);
    }
  });
  return child;
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await Promise.all(
      [...children].map((child) =>
        stopChild(child, childShutdownGrace.get(child)),
      ),
    );
  } catch {
    console.error(
      '[dev] An owned child did not stop within the shutdown deadline',
    );
    code = 1;
  }
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(130));
process.on('SIGTERM', () => void shutdown(143));

spawnChild(
  'api',
  process.execPath,
  [join(root, 'scripts', 'dev-docker-api-watch.mjs')],
  {},
  watcherShutdownGraceMs(process.env.DEV_API_RESTART_GRACE_MS),
);
spawnChild('chat', bin('vite'), [], { cwd: join(root, 'apps', 'chat') });
