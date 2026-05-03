import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { GemmaMcpToolsService } from './gemma-mcp-tools.service';

describe('GemmaMcpToolsService', () => {
  const mcpConfigBackup = process.env.MCP_CONFIG_JSON;
  const fetchBackup = globalThis.fetch;

  beforeEach(() => {
    delete process.env.MCP_CONFIG_JSON;
    globalThis.fetch = fetchBackup;
  });

  afterEach(() => {
    if (mcpConfigBackup === undefined) {
      delete process.env.MCP_CONFIG_JSON;
    } else {
      process.env.MCP_CONFIG_JSON = mcpConfigBackup;
    }
    globalThis.fetch = fetchBackup;
  });

  test('does not synthesize tools for stdio MCP servers', async () => {
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        fibe: {
          command: 'fibe',
          args: ['mcp', 'serve', '--tools', 'core'],
        },
      },
    });

    const service = new GemmaMcpToolsService();
    await service.refresh();

    expect(service.getTools()).toEqual([]);
  });

  test('fetches real tool descriptions only from HTTP MCP servers', async () => {
    process.env.MCP_CONFIG_JSON = JSON.stringify({
      mcpServers: {
        fibe: {
          serverUrl: 'http://127.0.0.1:7797/mcp',
        },
      },
    });
    globalThis.fetch = (async () => new Response(JSON.stringify({
      result: {
        tools: [
          { name: 'fibe_greenfield_create', description: 'Create greenfield app' },
          { name: 'fibe_greenfield_create', description: 'Duplicate ignored' },
          { name: 'fibe_status' },
        ],
      },
    }), { status: 200 })) as typeof fetch;

    const service = new GemmaMcpToolsService();
    await service.refresh();

    expect(service.getTools()).toEqual([
      { name: 'fibe_greenfield_create', description: 'Create greenfield app' },
      { name: 'fibe_status', description: 'fibe_status' },
    ]);
  });
});
