import { readFileSync } from 'node:fs';
import { captureText, cpuCount, run } from './lib.mjs';

const packageManager = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).packageManager;
if (!/^bun@\d+\.\d+\.\d+$/.test(packageManager)) throw new Error('Pin the Bun package manager to an exact version');
const bunVersion = packageManager.slice(4);
const nodeGypVersion = '13.0.2';

process.env.DEBIAN_FRONTEND = 'noninteractive';
process.env.PATH = `/opt/fibe-ci-tools/node_modules/.bin:${process.env.PATH}`;
process.env.npm_config_node_gyp = '/opt/fibe-ci-tools/node_modules/.bin/node-gyp';
process.env.MAKEFLAGS ||= `-j${process.env.NPM_CONFIG_JOBS || cpuCount()}`;
delete process.env.NPM_CONFIG_JOBS;
delete process.env.npm_config_jobs;

console.log('--> Installing native build dependencies');
const hasNativeBuildDeps = await run('sh', [
  '-lc',
  'command -v python3 >/dev/null 2>&1 && command -v make >/dev/null 2>&1 && command -v g++ >/dev/null 2>&1 && test -r /etc/ssl/certs/ca-certificates.crt',
])
  .then(() => true)
  .catch(() => false);

if (hasNativeBuildDeps) {
  console.log('--> Native build dependencies already present');
} else {
  await run('apt-get', ['update']);
  await run('apt-get', ['install', '-y', '--no-install-recommends', 'python3', 'make', 'g++', 'ca-certificates']);
  await run('sh', ['-lc', 'rm -rf /var/lib/apt/lists/*']);
}

const hasToolchain = await Promise.all([
  captureText('bun', ['--version']),
  captureText('node-gyp', ['--version']),
])
  .then(([bun, nodeGyp]) => bun.trim() === bunVersion && nodeGyp.trim() === `v${nodeGypVersion}`)
  .catch(() => false);

if (!hasToolchain) {
  console.log('--> Installing the pinned Bun toolchain');
  await run('npm', ['install', '--prefix', '/opt/fibe-ci-tools', packageManager, `node-gyp@${nodeGypVersion}`]);
} else {
  console.log('--> Pinned Bun toolchain already installed (cached)');
}

console.log('--> Installing project dependencies');
await run('bun', ['install', '--frozen-lockfile']);
