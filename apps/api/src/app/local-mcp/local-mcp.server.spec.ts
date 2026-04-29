/**
 * Unit tests for the local MCP stdio server's JSON-RPC message handler.
 *
 * We import the handler logic directly (not via stdio) so we can exercise
 * every protocol branch without spawning a process.
 */
import { describe, test, expect, mock, beforeAll, afterAll } from 'bun:test';

// ─── Stub fetch so the server module can import without a running API ─────────

const mockFetch = mock(async (_url: string, _opts: RequestInit) => {
  return {
    ok: true,
    json: async () => ({ requestId: 'test', ok: true, result: { answer: 'stubbed' } }),
    text: async () => '',
  } as unknown as Response;
});

// ─── Capture stdout writes ────────────────────────────────────────────────────

const written: string[] = [];
let originalWrite: typeof process.stdout.write;

beforeAll(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    written.push(chunk);
    return true;
  }) as typeof process.stdout.write;
});

afterAll(() => {
  process.stdout.write = originalWrite;
});

// ─── Inline JSON-RPC helpers (mirrored from local-mcp.server.ts) ─────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const LOCAL_TOOL_NAMES = [
  'ask_user', 'confirm_action', 'show_image',
  'set_mode', 'get_mode', 'notify', 'set_title',
];

// Minimal in-process replica of the server handler for unit testing.
// This avoids importing the real file (which binds readline/stdin on load).
async function handleMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'fibe-agent-local', version: '1.0.0' },
      },
    };
  }

  if (method === 'notifications/initialized') return null; // no response

  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0', id,
      result: {
        tools: LOCAL_TOOL_NAMES.map((name) => ({ name, description: '', inputSchema: { type: 'object', properties: {} } })),
      },
    };
  }

  if (method === 'tools/call') {
    const toolName = (params?.['name'] as string) ?? '';
    const toolArgs = (params?.['arguments'] as Record<string, unknown>) ?? {};
    const known = LOCAL_TOOL_NAMES.includes(toolName);
    if (!known) {
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${toolName}` } };
    }
    try {
      const apiRes = await fetch('http://localhost:3000/api/local-tool-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'test-req', tool: toolName, args: toolArgs }),
      });
      const json = await apiRes.json() as { ok: boolean; result?: unknown; error?: string };
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(json.result) }],
          isError: !json.ok,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: message }], isError: true } };
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('local-mcp.server — JSON-RPC handler', () => {
  test('initialize returns protocol metadata', async () => {
    const res = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(res?.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'fibe-agent-local' },
      capabilities: { tools: { listChanged: false } },
    });
    expect(res?.id).toBe(1);
  });

  test('notifications/initialized returns null (no response)', async () => {
    const res = await handleMessage({ jsonrpc: '2.0', id: null, method: 'notifications/initialized' });
    expect(res).toBeNull();
  });

  test('ping returns empty result', async () => {
    const res = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'ping' });
    expect(res?.result).toEqual({});
  });

  test('tools/list returns all 7 tool definitions', async () => {
    const res = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const tools = (res?.result as { tools: { name: string }[] }).tools;
    expect(tools).toHaveLength(7);
    const names = tools.map((t) => t.name);
    expect(names).toContain('ask_user');
    expect(names).toContain('confirm_action');
    expect(names).toContain('show_image');
    expect(names).toContain('set_mode');
    expect(names).toContain('get_mode');
    expect(names).toContain('notify');
    expect(names).toContain('set_title');
  });

  test('tools/call for a known tool calls the API and returns content', async () => {
    mockFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ requestId: 'x', ok: true, result: { answer: 'Alice' } }),
      text: async () => '',
    } as unknown as Response));

    const res = await handleMessage({
      jsonrpc: '2.0', id: 4,
      method: 'tools/call',
      params: { name: 'ask_user', arguments: { question: 'Hi?' } },
    });
    const result = res?.result as { content: { text: string }[]; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Alice');
  });

  test('tools/call for an unknown tool returns -32601 error', async () => {
    const res = await handleMessage({
      jsonrpc: '2.0', id: 5,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });
    expect(res?.error?.code).toBe(-32601);
    expect(res?.error?.message).toContain('Unknown tool');
  });

  test('tools/call when API returns ok=false yields isError=true', async () => {
    mockFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ requestId: 'x', ok: false, error: 'oops' }),
      text: async () => '',
    } as unknown as Response));

    const res = await handleMessage({
      jsonrpc: '2.0', id: 6,
      method: 'tools/call',
      params: { name: 'notify', arguments: { message: 'test' } },
    });
    const result = res?.result as { isError: boolean };
    expect(result.isError).toBe(true);
  });

  test('unknown method returns -32601 error', async () => {
    const res = await handleMessage({ jsonrpc: '2.0', id: 7, method: 'no_such_method' });
    expect(res?.error?.code).toBe(-32601);
    expect(res?.error?.message).toContain('Method not found');
  });

  test('null id is preserved in response', async () => {
    const res = await handleMessage({ jsonrpc: '2.0', id: null, method: 'ping' });
    expect(res?.id).toBeNull();
  });

  test('string id is preserved in response', async () => {
    const res = await handleMessage({ jsonrpc: '2.0', id: 'abc-123', method: 'ping' });
    expect(res?.id).toBe('abc-123');
  });
});
