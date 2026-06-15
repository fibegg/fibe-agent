import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface LocalMcpLaunch {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function resolveLocalMcpLaunch(
  baseEnv: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): LocalMcpLaunch {
  const env: Record<string, string> = {
    FIBE_LOCAL_MCP_SERVER: '1',
    PORT: baseEnv['PORT'] ?? '3000',
  };
  if (baseEnv['AGENT_PASSWORD']) env.AGENT_PASSWORD = baseEnv['AGENT_PASSWORD'];
  if (baseEnv['CONVERSATION_ID']) env.CONVERSATION_ID = baseEnv['CONVERSATION_ID'];

  for (const candidate of bundledMainCandidates(cwd)) {
    if (existsSync(candidate)) {
      return { command: process.execPath, args: [candidate], env };
    }
  }

  const sourceServer = join(cwd, 'apps', 'api', 'src', 'app', 'local-mcp', 'local-mcp.server.ts');
  if (existsSync(sourceServer)) {
    return {
      command: process.execPath,
      args: ['-r', '@swc-node/register', sourceServer],
      env: withoutServerMode(env),
    };
  }

  return {
    command: process.execPath,
    args: [join(__dirname, 'local-mcp.server.js')],
    env,
  };
}

function bundledMainCandidates(cwd: string): string[] {
  return [
    join(cwd, 'dist', 'main.js'),
    join(cwd, 'apps', 'api', 'dist', 'main.js'),
  ];
}

function withoutServerMode(env: Record<string, string>): Record<string, string> {
  const { FIBE_LOCAL_MCP_SERVER: _serverMode, ...rest } = env;
  return rest;
}
