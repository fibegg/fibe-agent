import { chmod, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { run } from './lib.mjs';

const geminiBin = 'tests/bin/gemini';

// CI services have separate writable layers: ci-setup's apt packages are not
// available in this container. Keep the real installer parsers/checksum tools.
const hasInstallerTools = await run('sh', ['-lc', 'command -v jq >/dev/null 2>&1 && command -v sha256sum >/dev/null 2>&1'])
  .then(() => true)
  .catch(() => false);
if (!hasInstallerTools) {
  await run('apt-get', ['update']);
  await run('apt-get', ['install', '-y', '--no-install-recommends', 'jq', 'coreutils']);
  await run('sh', ['-lc', 'rm -rf /var/lib/apt/lists/*']);
}

console.log('--> Checking release integrity and retained CI failure diagnostics');
await run('node', ['--test', 'scripts/ci/notify.test.mjs', 'scripts/ci/install-provider.test.mjs', 'scripts/ci/install-fibe.test.mjs', 'scripts/ci/cli-build.test.mjs']);

console.log('--> Running unit tests');
await run('bun', ['run', 'test']);

console.log('--> Running Integration tests');
if (existsSync(geminiBin)) {
  const content = await readFile(geminiBin, 'utf8');
  await writeFile(geminiBin, content.replace(/\r/g, ''));
  await chmod(geminiBin, 0o755);
  await run('bun', ['run', 'test:integration']);
} else {
  console.log('--> No Integration tests found!');
}
