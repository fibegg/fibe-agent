import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveLocalMcpLaunch } from './local-mcp-launch';

const tmpRoots: string[] = [];

function makeRoot(): string {
  const root = join(tmpdir(), `local-mcp-launch-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tmpRoots.push(root);
  return root;
}

function touch(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '');
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('resolveLocalMcpLaunch', () => {
  test('uses production /app/dist/main.js style bundle when present', () => {
    const root = makeRoot();
    const main = join(root, 'dist', 'main.js');
    touch(main);

    const launch = resolveLocalMcpLaunch({ PORT: '4444', AGENT_PASSWORD: 'secret' }, root);

    expect(launch.command).toBe(process.execPath);
    expect(launch.args).toEqual([main]);
    expect(launch.env).toEqual({
      FIBE_LOCAL_MCP_SERVER: '1',
      PORT: '4444',
      AGENT_PASSWORD: 'secret',
    });
  });

  test('uses dev apps/api/dist/main.js bundle when present', () => {
    const root = makeRoot();
    const main = join(root, 'apps', 'api', 'dist', 'main.js');
    touch(main);

    const launch = resolveLocalMcpLaunch({}, root);

    expect(launch.args).toEqual([main]);
    expect(launch.env.FIBE_LOCAL_MCP_SERVER).toBe('1');
    expect(launch.env.PORT).toBe('3000');
  });

  test('falls back to source TypeScript through swc-node when no bundle exists', () => {
    const root = makeRoot();
    const source = join(root, 'apps', 'api', 'src', 'app', 'local-mcp', 'local-mcp.server.ts');
    touch(source);

    const launch = resolveLocalMcpLaunch({ CONVERSATION_ID: 'conversation-1' }, root);

    expect(launch.args).toEqual(['-r', '@swc-node/register', source]);
    expect(launch.env).toEqual({
      PORT: '3000',
      CONVERSATION_ID: 'conversation-1',
    });
  });
});
