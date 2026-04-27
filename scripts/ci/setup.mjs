import { cpuCount, run } from './lib.mjs';

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

const hasToolchain = await run('sh', ['-lc', 'command -v bun >/dev/null 2>&1 && command -v node-gyp >/dev/null 2>&1'])
  .then(() => true)
  .catch(() => false);

if (!hasToolchain) {
  console.log('--> Installing cached Bun toolchain');
  await run('npm', ['install', '--prefix', '/opt/fibe-ci-tools', 'bun@1.3.11', 'node-gyp']);
} else {
  console.log('--> Bun toolchain already installed (cached)');
}

console.log('--> Installing project dependencies');
await run('bun', ['install', '--frozen-lockfile']);
