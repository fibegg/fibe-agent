#!/usr/bin/env node
/**
 * local-mcp.server.ts — Stdio MCP server for fibe-agent local tools.
 *
 * Spawned as a child process by LocalMcpService. Implements the MCP
 * JSON-RPC protocol over stdin/stdout (stdio transport) so any agent CLI
 * that supports MCP can call fibe-agent's interactive tools.
 *
 * Communication back to the parent NestJS process is done via HTTP:
 *   POST http://localhost:<PORT>/api/local-tool-call
 *
 * Tool definitions exposed via tools/list:
 *   ask_user            — ask the operator a question; blocks until answered
 *   confirm_action      — ask yes/no; blocks until answered
 *   show_image          — render an image inline in the chat thread (fire-and-forget)
 *   set_mode            — set the agent mode (exploring, casting, overseeing, build)
 *   get_mode            — return current agent mode
 *   notify              — show a toast notification (fire-and-forget)
 *   set_title           — update the run title in the sidebar (fire-and-forget)
 */

import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import type { LocalToolCallResponse } from './local-mcp-types';
import { LOCAL_TOOL } from './local-mcp-types';

// ─── Config ──────────────────────────────────────────────────────────────────

const API_PORT = process.env['PORT'] ?? '3000';
const TOOL_CALL_URL = `http://localhost:${API_PORT}/api/local-tool-call`;
const AGENT_PASSWORD = process.env['AGENT_PASSWORD'] ?? '';
const CONVERSATION_ID = process.env['CONVERSATION_ID'] ?? '';

// ─── JSON-RPC helpers ────────────────────────────────────────────────────────

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

function reply(id: string | number | null, result: unknown): void {
  const response: JsonRpcResponse = { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function replyError(
  id: string | number | null,
  code: number,
  message: string,
): void {
  const response: JsonRpcResponse = {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: LOCAL_TOOL.ASK_USER,
    description:
      'Ask the operator (user) a question and wait for their typed answer. ' +
      'Returns { answer: string }. Use for open-ended questions.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to display to the user.' },
        placeholder: { type: 'string', description: 'Optional hint text inside the input field.' },
      },
      required: ['question'],
    },
  },
  {
    name: LOCAL_TOOL.CONFIRM_ACTION,
    description:
      'Ask the operator to confirm or deny an action. Returns { confirmed: boolean }. ' +
      'Use before irreversible operations.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Description of the action to confirm.' },
        confirmLabel: { type: 'string', description: 'Label for the confirm button (default: "Yes").' },
        cancelLabel: { type: 'string', description: 'Label for the cancel button (default: "No").' },
      },
      required: ['message'],
    },
  },
  {
    name: LOCAL_TOOL.SHOW_IMAGE,
    description:
      'Display an image inline in the chat thread. ' +
      'Returns { ok: true }. Non-blocking \u2014 does not wait for acknowledgement.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Public URL of the image to display.' },
        base64: { type: 'string', description: 'Base64-encoded image data (alternative to url).' },
        mimeType: { type: 'string', description: 'MIME type when using base64, e.g. image/png.' },
        caption: { type: 'string', description: 'Optional caption shown below the image.' },
      },
    },
  },
  {
    name: LOCAL_TOOL.SET_MODE,
    description:
      'Set the agent mode. Returns { ok: true, mode: string }. ' +
      'Valid values: exploring, casting, overseeing, build.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['exploring', 'casting', 'overseeing', 'build'],
          description: 'The new agent mode.',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: LOCAL_TOOL.GET_MODE,
    description: 'Return the current agent mode display string. Returns { mode: string }.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: LOCAL_TOOL.NOTIFY,
    description:
      'Send a non-blocking toast notification to the chat UI. ' +
      'Returns { ok: true }. The agent continues immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Notification message.' },
        level: {
          type: 'string',
          enum: ['info', 'success', 'warning', 'error'],
          description: 'Severity level (default: info).',
        },
      },
      required: ['message'],
    },
  },
  {
    name: LOCAL_TOOL.SET_TITLE,
    description:
      'Update the activity title shown in the sidebar for this run. ' +
      'Returns { ok: true }.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'New title to display.' },
      },
      required: ['title'],
    },
  },
];

// ─── Tool call dispatcher ────────────────────────────────────────────────────

async function callLocalApi(
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const requestId = randomUUID();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AGENT_PASSWORD) {
    headers['Authorization'] = `Bearer ${AGENT_PASSWORD}`;
  }

  const res = await fetch(TOOL_CALL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requestId,
      tool,
      args,
      ...(CONVERSATION_ID ? { conversationId: CONVERSATION_ID } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Local tool call failed (HTTP ${res.status}): ${body}`);
  }

  const json = (await res.json()) as LocalToolCallResponse;
  if (!json.ok) {
    throw new Error(json.error ?? 'Unknown error from local tool handler');
  }
  return json.result;
}

// ─── MCP message handler ─────────────────────────────────────────────────────

async function handleMessage(msg: JsonRpcRequest): Promise<void> {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    reply(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'fibe-agent-local', version: '1.0.0' },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    // No response needed for notifications
    return;
  }

  if (method === 'tools/list') {
    reply(id, { tools: TOOL_DEFINITIONS });
    return;
  }

  if (method === 'tools/call') {
    const toolName = (params?.['name'] as string) ?? '';
    const toolArgs = (params?.['arguments'] as Record<string, unknown>) ?? {};

    const known = TOOL_DEFINITIONS.some((t) => t.name === toolName);
    if (!known) {
      replyError(id, -32601, `Unknown tool: ${toolName}`);
      return;
    }

    try {
      const result = await callLocalApi(toolName, toolArgs);
      reply(id, {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reply(id, {
        content: [{ type: 'text', text: message }],
        isError: true,
      });
    }
    return;
  }

  if (method === 'ping') {
    reply(id, {});
    return;
  }

  // Unknown method
  replyError(id, -32601, `Method not found: ${method}`);
}

// ─── Stdin reader ─────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: JsonRpcRequest;
  try {
    msg = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    // Malformed JSON — return parse error
    replyError(null, -32700, 'Parse error');
    return;
  }

  void handleMessage(msg).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    replyError(msg.id ?? null, -32603, `Internal error: ${message}`);
  });
});

rl.on('close', () => {
  process.exit(0);
});

// Keep alive — do not exit until stdin closes
process.stdin.resume();
