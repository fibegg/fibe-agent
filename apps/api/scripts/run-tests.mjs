import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const srcRoot = join(root, 'src');
const testPattern = /\.(test|spec)\.ts$/;

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

const files = walk(srcRoot).map((path) => relative(root, path));

if (files.length === 0) {
  console.error('No API test files found under src/.');
  process.exit(1);
}

console.log(`Running ${files.length} API test files in isolated Bun processes.`);

for (const file of files) {
  console.log(`\n== ${file} ==`);
  const result = spawnSync('bun', ['test', '--preload', './test-setup.ts', file], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
