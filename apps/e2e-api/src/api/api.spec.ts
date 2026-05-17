import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { waitForPortOpen, killPort } from '@nx/node/utils';
import { API_BASE_URL, host } from '../support/test-setup';

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const password = 'e2e-agent-pass';

beforeAll(async () => {
  await waitForPortOpen(port, { host });
});

afterAll(async () => {
  await killPort(port);
});

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, init);
}

async function login(): Promise<string> {
  const res = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  expect(res.status).toBe(201);
  const body = await res.json() as { token?: string };
  expect(body.token).toBe(password);
  return body.token;
}

async function authedGet(path: string): Promise<Response> {
  const token = await login();
  return api(path, {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function authedJson(path: string, method: string, body: unknown): Promise<Response> {
  const token = await login();
  return api(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function waitForPostInitOutput(): Promise<string> {
  const token = await login();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const res = await api('/api/init-status', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { state: string; output?: string };
    if (body.state === 'done') return body.output ?? '';
    await Bun.sleep(100);
  }
  throw new Error('post-init script did not finish in time');
}

function parseEnvOutput(output: string): Record<string, string> {
  return Object.fromEntries(
    output
      .trim()
      .split('\n')
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

function parseJsonEcho<T>(body: string, label: string): T {
  const match = body.match(new RegExp(`${label}:\\n([^\\n]+)`));
  expect(match?.[1]).toBeDefined();
  return JSON.parse(match?.[1] as string) as T;
}

async function waitForAssistantMessage(conversationId: string): Promise<string> {
  const token = await login();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const res = await api(`/api/conversations/${conversationId}/messages`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const messages = await res.json() as Array<{ role: string; body: string }>;
    const assistant = messages.find((message) => message.role === 'assistant');
    if (assistant?.body) return assistant.body;
    await Bun.sleep(100);
  }
  throw new Error('assistant message did not arrive in time');
}

describe('API e2e', () => {
  test('serves health with frame and CORS settings from fibe.yml', async () => {
    const res = await api('/api/health', {
      headers: { origin: 'http://example.test' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://example.test');
    expect(res.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'self' http://localhost:3100"
    );
  });

  test('exposes runtime UI settings from fibe.yml without auth', async () => {
    const res = await api('/api/runtime-config');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      userAvatarUrl: 'https://example.test/user.png',
      assistantAvatarBase64: 'data:image/png;base64,ZmliZQ==',
      agentProvider: 'mock',
      agentProviderLabel: 'Mock',
      simplicate: true,
    });
  });

  test('requires the fibe.yml password and serves guarded defaults after login', async () => {
    expect((await api('/api/model-options')).status).toBe(401);

    const badLogin = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    });
    expect(badLogin.status).toBe(401);

    const models = await authedGet('/api/model-options');
    expect(models.status).toBe(200);
    expect(await models.json()).toEqual(['e2e-small', 'e2e-large']);

    const initStatus = await authedGet('/api/init-status');
    expect(initStatus.status).toBe(200);
    expect(await initStatus.json()).toMatchObject({
      systemPrompt: 'E2E system prompt from fibe.yml',
    });
  });

  test('applies sync defaults and command settings from fibe.yml at runtime', async () => {
    const syncSettings = await authedGet('/api/fibe-sync-settings');
    expect(syncSettings.status).toBe(200);
    expect(await syncSettings.json()).toMatchObject({
      messages: true,
      activity: true,
      rawProviders: true,
    });

    const promoted = parseEnvOutput(await waitForPostInitOutput());
    expect(JSON.parse(promoted.PROVIDER_ARGS)).toEqual({
      sandbox: 'workspace-write',
      'approval-mode': 'never',
      'max-turns': 7,
      'max-tokens': 4096,
      temperature: 0.2,
      'dry-run': false,
      config: 'value with spaces',
      c: 'never',
      verbose: true,
      bare: true,
      label: 'value with spaces',
      retries: -3,
      p: 'blocked-prompt-value',
      'dangerously-skip-permissions': true,
      yolo: true,
      prompt: 'blocked-long-prompt-value',
      json: true,
      'output-format': 'stream-json',
    });
    expect(promoted.FIBE_CLI_VERSION).toBe('0.78.0-e2e');
    expect(JSON.parse(promoted.SKILL_TOGGLES)).toEqual({
      'fibe-hunks.md': false,
      'fibe-planning.md': true,
    });
    expect(promoted.SYSCHECK_ENABLED).toBe('false');
    expect(JSON.parse(promoted.MCP_CONFIG_JSON)).toEqual({
      mcpServers: {
        'local-fixture': {
          command: 'node',
          args: ['fixture-server.js'],
        },
      },
    });
    expect(promoted.ASK_USER_TIMEOUT_MS).toBe('3456');
    expect(promoted.GEMMA_ROUTER_ENABLED).toBe('true');
    expect(promoted.GEMMA_MODEL).toBe('gemma-e2e');
    expect(promoted.GEMMA_CONFIDENCE_THRESHOLD).toBe('0.42');
    expect(promoted.GEMMA_TIMEOUT_MS).toBe('1234');
    expect(promoted.LOCK_CHAT_MODEL).toBe('true');
    expect(promoted.CORS_ORIGINS).toBe('http://localhost:3100,http://example.test');
  });

  test('passes the fibe.yml system prompt to the provider prompt boundary', async () => {
    const conversationId = `prompt-e2e-${Date.now()}`;
    const create = await authedJson('/api/conversations', 'POST', {
      id: conversationId,
      title: 'Prompt E2E',
    });
    expect([200, 201]).toContain(create.status);

    const send = await authedJson(`/api/conversations/${conversationId}/agent/send-message`, 'POST', {
      text: 'Verify prompt boundary from e2e',
    });
    expect([201, 202]).toContain(send.status);

    const assistantBody = await waitForAssistantMessage(conversationId);
    expect(assistantBody).toContain('SYSTEM_PROMPT:\nE2E system prompt from fibe.yml');
    expect(parseJsonEcho<Record<string, unknown>>(assistantBody, 'PROVIDER_ARGS_JSON')).toEqual({
      sandbox: 'workspace-write',
      'approval-mode': 'never',
      'max-turns': 7,
      'max-tokens': 4096,
      temperature: 0.2,
      'dry-run': false,
      config: 'value with spaces',
      c: 'never',
      verbose: true,
      bare: true,
      label: 'value with spaces',
      retries: -3,
      p: 'blocked-prompt-value',
      'dangerously-skip-permissions': true,
      yolo: true,
      prompt: 'blocked-long-prompt-value',
      json: true,
      'output-format': 'stream-json',
    });
    expect(parseJsonEcho<string[]>(assistantBody, 'PROVIDER_CLI_TOKENS_JSON')).toEqual([
      '--sandbox',
      'workspace-write',
      '--approval-mode',
      'never',
      '--max-turns',
      '7',
      '--max-tokens',
      '4096',
      '--temperature',
      '0.2',
      '--dry-run',
      'false',
      '--config',
      'value with spaces',
      '-c',
      'never',
      '--verbose',
      '--bare',
      '--label',
      'value with spaces',
      '--retries',
      '-3',
    ]);
    expect(assistantBody).toContain('PROMPT:');
    expect(assistantBody).toContain('Verify prompt boundary from e2e');
  });
});
