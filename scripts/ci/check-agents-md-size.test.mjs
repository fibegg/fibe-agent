import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkAgentsMdSize, maxAgentsMdBytes } from './check-agents-md-size.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const checker = fileURLToPath(new URL('./check-agents-md-size.mjs', import.meta.url));

test('the limit is 16 KiB and a file at the limit passes', async () => {
  assert.equal(maxAgentsMdBytes, 16_384);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fibe-agents-md-'));
  try {
    const file = path.join(dir, 'AGENTS.md');
    await writeFile(file, 'a'.repeat(maxAgentsMdBytes));
    assert.equal(checkAgentsMdSize(file).ok, true);

    await writeFile(file, 'a'.repeat(maxAgentsMdBytes + 1));
    const result = checkAgentsMdSize(file);
    assert.equal(result.ok, false);
    assert.match(result.message, /AGENTS\.md is 16385 bytes, above the 16384-byte limit/);

    const child = spawnSync(process.execPath, [checker, file], { encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /above the 16384-byte limit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the repository AGENTS.md is within the limit', () => {
  const result = checkAgentsMdSize(path.join(repoRoot, 'AGENTS.md'));
  assert.equal(result.ok, true, result.message);
});
