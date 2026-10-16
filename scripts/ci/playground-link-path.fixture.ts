import assert from 'node:assert/strict';
import {
  accessSync,
  chownSync,
  constants,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadFibeEnv } from '../../apps/api/src/load-env';
import { ConfigService } from '../../apps/api/src/app/config/config.service';
import { PlaygroundBrowserService } from '../../apps/api/src/app/playgrounds/playground-browser.service';
import { PlaygroundsService } from '../../apps/api/src/app/playgrounds/playgrounds.service';

async function main() {
  // Reproduce the image layout: /app belongs to root, but its legacy link
  // directory belongs to the runtime user. Only persistent data is writable.
  assert.equal(process.getuid?.(), 0);
  const source = '/host/playgrounds/app--77/repositories/team--app--1/main';
  mkdirSync(source, { recursive: true });
  writeFileSync(`${source}/source.txt`, 'preserved edit');
  chownSync(source, 1000, 1000);
  chownSync(`${source}/source.txt`, 1000, 1000);
  writeFileSync(
    '/host/playgrounds/app--77/compose.yml',
    `services:
  web:
    labels:
      fibe.gg/spec: app
    volumes:
      - "${source}:/app"
`,
  );
  for (const path of [
    '/app/playground',
    '/app/data',
    '/app/custom-data',
    '/tmp/provider-cwd',
  ]) {
    mkdirSync(path, { recursive: true });
    chownSync(path, 1000, 1000);
  }
  process.setgid?.(1000);
  process.setuid?.(1000);
  assert.equal(process.getuid?.(), 1000);
  assert.equal(statSync('/app').uid, 0);
  accessSync('/app/playground', constants.W_OK);
  assert.throws(() => accessSync('/app', constants.W_OK), { code: 'EACCES' });

  // Demonstrate why the old target fails, even though it is itself writable.
  assert.throws(
    () =>
      execFileSync(
        'fibe',
        [
          '--output',
          'json',
          'local',
          'playgrounds',
          'link',
          '77',
          '--link-dir',
          '/app/playground',
        ],
        {
          env: { ...process.env, HOST_ROOT: '/host' },
          encoding: 'utf8',
          stdio: 'pipe',
        },
      ),
    (error: unknown) => {
      const failure = error as { status?: number; stderr?: Buffer };
      assert.equal(failure.status, 1);
      assert.match(String(failure.stderr), /permission denied/);
      return true;
    },
  );
  console.log(
    'PASS reproduced legacy parent-directory permission failure as UID 1000',
  );
  await verifySharedPaths();
}

async function verifySharedPaths() {
  const cases = [
    {
      id: 'agent-77',
      data: '/app/data',
      override: undefined,
      expected: '/app/data/agent-77/playground',
    },
    {
      id: 'agent-205',
      data: '/app/custom-data',
      override: '  ',
      expected: '/app/custom-data/agent-205/playground',
    },
    {
      id: undefined,
      data: '/app/data',
      override: undefined,
      expected: '/app/data/default/playground',
    },
    {
      id: 'agent-77',
      data: '/app/data',
      override: '/app/data/existing-links',
      expected: '/app/data/existing-links',
    },
    {
      id: 'agent-77',
      data: '/app/data',
      override: 'data/relative-links',
      expected: '/app/data/relative-links',
    },
  ];
  for (const scenario of cases) {
    process.chdir('/app');
    for (const key of [
      'PLAYGROUNDS_DIR',
      'FIBE_AGENT_ID',
      'CONVERSATION_ID',
      'DATA_DIR',
      'HOST_ROOT',
      'MCP_CONFIG_JSON',
    ])
      delete process.env[key];
    process.env.FIBE_SETTINGS_JSON = JSON.stringify({
      dataDir: scenario.data,
      fibeAgentId: scenario.id,
      hostRoot: '/host',
      mcpConfig: {
        mcpServers: {
          fibe: {
            command: 'fibe',
            args: ['mcp', 'serve', '--tools', 'full', '--yolo'],
          },
        },
      },
    });
    if (scenario.override !== undefined)
      process.env.PLAYGROUNDS_DIR = scenario.override;
    loadFibeEnv();
    const config = new ConfigService();
    assert.equal(config.getPlaygroundsDir(), scenario.expected);
    assert.equal(process.env.PLAYGROUNDS_DIR, scenario.expected);
    mkdirSync(config.getPlaygroundsDir(), { recursive: true });
    process.chdir('/tmp/provider-cwd');
    const cli = (...args: string[]) =>
      execFileSync(
        'fibe',
        ['--output', 'json', 'local', 'playgrounds', ...args],
        { encoding: 'utf8' },
      );
    cli('link', '77'); // Bare provider tool call, without --link-dir.
    const state = JSON.parse(cli('info', '--view', 'current'));
    assert.equal(state.id, '77');
    assert.equal(state.link_dir, scenario.expected);
    const repos = JSON.parse(cli('info', '--view', 'repos'));
    assert.equal(repos.length, 1);
    assert.equal(repos[0].link_path, `${scenario.expected}/app`);
    // Use the real MCP client transport: it filters inherited variables, so
    // the generated server configuration must carry the shared local paths.
    const mcp = JSON.parse(process.env.MCP_CONFIG_JSON!).mcpServers.fibe;
    const client = new Client({ name: 'path-contract', version: '1.0.0' });
    try {
      await client.connect(
        new StdioClientTransport({ ...mcp, stderr: 'pipe' }),
      );
      const linked = await client.callTool({
        name: 'fibe_local_playgrounds_link',
        arguments: { id_or_name: '77' },
      });
      assert.notEqual(linked.isError, true, JSON.stringify(linked));
      const current = await client.callTool({
        name: 'fibe_local_playgrounds_info',
        arguments: { view: 'current' },
      });
      assert.notEqual(current.isError, true, JSON.stringify(current));
    } finally {
      await client.close();
    }
    const browser = new PlaygroundBrowserService(config);
    const ui = new PlaygroundsService(config, browser);
    assert.equal(await browser.getCurrentLink(), 'app--77');
    assert.deepEqual(await ui.getRepos(), repos);
    const tree = await ui.getTree();
    assert.equal(tree[0]?.name, 'app');
    assert.equal(tree[0]?.children?.[0]?.path, 'app/source.txt');
    assert.equal(await ui.getFileContent('app/source.txt'), 'preserved edit');
    await browser.linkPlayground('77'); // UI relink must use the same root.
    cli('link', '77'); // Atomic replacement must remain repeatable.
    assert.equal(await ui.getFileContent('app/source.txt'), 'preserved edit');
    assert.equal(
      readFileSync(
        '/host/playgrounds/app--77/repositories/team--app--1/main/source.txt',
        'utf8',
      ),
      'preserved edit',
    );
    console.log(
      `PASS non-root CLI, filtered MCP transport and UI share ${scenario.expected}`,
    );
  }
  assert.equal(statSync('/app').uid, 0);
  assert.equal(statSync('/app').mode & 0o777, 0o755);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
