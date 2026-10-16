import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadFibeEnv } from './load-env';
import { ConfigService } from './app/config/config.service';

const keys = [
  'FIBE_SETTINGS_JSON',
  'PLAYGROUNDS_DIR',
  'FIBE_AGENT_ID',
  'DATA_DIR',
];
let original: Record<string, string | undefined>;
let directory: string;
const cwd = process.cwd();

beforeEach(() => {
  original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  directory = mkdtempSync(join(tmpdir(), 'playground-path-contract-'));
  process.chdir(directory);
  directory = process.cwd();
  process.env.FIBE_SETTINGS_JSON = JSON.stringify({
    dataDir: 'runtime-data',
    fibeAgentId: 'agent-77',
  });
});

afterEach(() => {
  process.chdir(cwd);
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});

test('bootstrap exports the UI link directory to tools with another working directory', () => {
  loadFibeEnv();
  const expected = join(directory, 'runtime-data/agent-77/playground');
  expect(new ConfigService().getPlaygroundsDir()).toBe(expected);
  const inherited = execFileSync(
    process.execPath,
    ['-e', 'console.log(process.env.PLAYGROUNDS_DIR)'],
    { cwd: tmpdir(), encoding: 'utf8' },
  ).trim();
  expect(inherited).toBe(expected);
  loadFibeEnv();
  expect(process.env.PLAYGROUNDS_DIR).toBe(expected);
});

test('bootstrap preserves an explicit persistent link directory', () => {
  process.env.PLAYGROUNDS_DIR = 'existing-linked-playground';
  loadFibeEnv();
  expect(process.env.PLAYGROUNDS_DIR).toBe(
    join(directory, 'existing-linked-playground'),
  );
  expect(new ConfigService().getPlaygroundsDir()).toBe(
    process.env.PLAYGROUNDS_DIR,
  );
});
