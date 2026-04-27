import { chmod, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { run } from './lib.mjs';

const geminiBin = 'tests/bin/gemini';

console.log('--> Running Integration tests');
if (existsSync(geminiBin)) {
  const content = await readFile(geminiBin, 'utf8');
  await writeFile(geminiBin, content.replace(/\r/g, ''));
  await chmod(geminiBin, 0o755);
  await run('bun', ['run', 'test:integration']);
} else {
  console.log('--> No Integration tests found!');
}
