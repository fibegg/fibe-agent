import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkDockerignore, copySources, isIncluded, parseDockerignore } from './check-dockerignore.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const checker = fileURLToPath(new URL('./check-dockerignore.mjs', import.meta.url));

const allowlist = `*

!package.json
!apps/api/
!scripts/
scripts/*
!scripts/install-provider.mjs
!.candidate-cli/
!.candidate-cli/fibe
**/node_modules
`;

async function withProject(files, callback) {
  const project = await mkdtemp(path.join(os.tmpdir(), 'fibe-dockerignore-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(project, name), content);
    }
    return await callback(project);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

test('.dockerignore evaluation follows Docker rules', () => {
  const patterns = parseDockerignore(allowlist);
  assert.equal(isIncluded(patterns, 'package.json'), true);
  assert.equal(isIncluded(patterns, 'README.md'), false);
  assert.equal(isIncluded(patterns, 'apps/api/src/main.ts'), true);
  assert.equal(isIncluded(patterns, 'apps/api/node_modules/x/index.js'), false);
  assert.equal(isIncluded(patterns, 'scripts/install-provider.mjs'), true);
  assert.equal(isIncluded(patterns, 'scripts/install-fibe.sh'), false);
  assert.equal(isIncluded(patterns, 'scripts/ci/lib.mjs'), false);
  assert.equal(isIncluded(patterns, '.candidate-cli/fibe'), true);
  assert.equal(isIncluded([], 'anything'), true);
});

test('COPY and ADD sources are read from build-context instructions only', () => {
  const sources = copySources(`# syntax=docker/dockerfile:1
FROM node:24-slim AS cli
COPY --link package.json ./
copy scripts/install-provider.mjs \\
  # a comment inside a continuation
  scripts/provider-versions.json ./scripts/
COPY --from=builder /app/dist ./dist/
COPY --link --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
COPY ["scripts/mcp-remote-wrapper.sh", "/usr/local/bin/mcp-remote-wrapper"]
ADD https://example.invalid/tool.tar.gz /tmp/
COPY --chmod=755 ./mode/ /app/mode
COPY \${SOURCE_DIR}/file /app/
RUN echo COPY scripts/not-a-copy /tmp
`);
  assert.deepEqual(
    sources.map(({ line, instruction, source }) => `${line} ${instruction} ${source}`),
    [
      '3 COPY package.json',
      '4 COPY scripts/install-provider.mjs',
      '4 COPY scripts/provider-versions.json',
      '9 COPY scripts/mcp-remote-wrapper.sh',
      '11 COPY mode',
    ],
  );
});

test('a COPY of a script without an allow line is reported with the line to add', async () => {
  await withProject(
    {
      '.dockerignore': allowlist,
      Dockerfile: 'FROM node:24-slim\nCOPY scripts/install-provider.mjs ./\nCOPY scripts/install-fibe.sh /usr/local/bin/\n',
    },
    async (project) => {
      const result = checkDockerignore(project);
      assert.equal(result.ok, false);
      assert.equal(result.checked, 2);
      assert.deepEqual(result.problems, [
        'Dockerfile:3: COPY source scripts/install-fibe.sh is excluded by .dockerignore; add the allow line "!scripts/install-fibe.sh"',
      ]);

      const child = spawnSync(process.execPath, [checker], { encoding: 'utf8', cwd: project });
      assert.equal(child.status, 0, 'without arguments the checker reads the repository, not the working directory');
    },
  );
});

test('a Dockerfile-specific ignore file takes precedence', async () => {
  await withProject(
    {
      '.dockerignore': allowlist,
      'Dockerfile.dev': 'FROM node:24-slim\nCOPY scripts/install-fibe.sh /usr/local/bin/\n',
      'Dockerfile.dev.dockerignore': `${allowlist}!scripts/install-fibe.sh\n`,
    },
    async (project) => {
      const result = checkDockerignore(project);
      assert.equal(result.ok, true, result.problems.join('\n'));
      assert.equal(result.checked, 1);
    },
  );
});

test('a wildcard source is checked against the context files it matches', async () => {
  await withProject(
    {
      '.dockerignore': '*\n!package.json\n!package-lock.json\n',
      'package.json': '{}',
      'package-lock.json': '{}',
      'package-extra.json': '{}',
      Dockerfile: 'FROM node:24-slim\nCOPY package*.json ./\nCOPY missing-*.lock ./\n',
    },
    async (project) => {
      const result = checkDockerignore(project);
      assert.equal(result.ok, false);
      assert.deepEqual(result.problems, [
        'Dockerfile:2: COPY source package-extra.json is excluded by .dockerignore; add the allow line "!package-extra.json"',
      ]);
    },
  );
});

test('the repository Dockerfiles copy only allowlisted sources', () => {
  const result = checkDockerignore(repoRoot);
  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.ok(result.checked > 10, `expected the repository Dockerfiles to have COPY sources, got ${result.checked}`);
});
