import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OpencodeStrategy, buildOpencodeRunArgs, resolveOpencodeAppServerTurnTimeoutMs } from './opencode.strategy';
import type { AuthConnection, LogoutConnection } from './strategy.types';

const TEST_HOME = join(tmpdir(), `opencode-test-home-${process.pid}`);

function writeFakeOpencode(path: string): void {
  writeFileSync(path, `#!/usr/bin/env node
const fs = require('node:fs');
const http = require('node:http');
const args = process.argv.slice(2);
if (process.env.OPENCODE_FAKE_ARGS_PATH) {
  fs.writeFileSync(process.env.OPENCODE_FAKE_ARGS_PATH, JSON.stringify(args));
}
if (process.env.OPENCODE_FAKE_ENV_PATH) {
  fs.writeFileSync(process.env.OPENCODE_FAKE_ENV_PATH, process.env.OPENCODE_CONFIG_CONTENT || '');
}
function record(value) {
  if (!process.env.OPENCODE_FAKE_REQUESTS_PATH) return;
  fs.appendFileSync(process.env.OPENCODE_FAKE_REQUESTS_PATH, JSON.stringify(value) + '\\n');
}
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : undefined); }
      catch { resolve(body); }
    });
  });
}
function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}
function sendEvent(clients, event) {
  for (const client of clients) client.write('data: ' + JSON.stringify(event) + '\\n\\n');
}
if (args[0] === 'serve') {
  const port = Number(args[args.indexOf('--port') + 1]);
  const clients = new Set();
  const sessionID = process.env.OPENCODE_FAKE_SESSION_ID || 'ses_fakeOpenCodeSession';
  let messageCounter = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    record({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams.entries()) });
    if (req.method === 'GET' && url.pathname === '/global/health') {
      sendJson(res, 200, { healthy: true, version: 'fake' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/event') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      clients.add(res);
      res.write('data: {"type":"server.connected","properties":{}}\\n\\n');
      if (process.env.OPENCODE_FAKE_REPLAY_PREVIOUS_EVENTS === '1') {
        res.write('data: ' + JSON.stringify({ type: 'message.updated', properties: { info: { id: 'msg_old_assistant', sessionID, role: 'assistant' } } }) + '\\n\\n');
        res.write('data: ' + JSON.stringify({ type: 'message.part.updated', properties: { part: { id: 'prt_old_text', sessionID, messageID: 'msg_old_assistant', type: 'text', text: 'stale replay response' } } }) + '\\n\\n');
        res.write('data: ' + JSON.stringify({ type: 'session.idle', properties: { sessionID } }) + '\\n\\n');
      }
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/session') {
      const body = await readBody(req);
      record({ type: 'create-session-body', query: Object.fromEntries(url.searchParams.entries()), body });
      sendJson(res, 200, {
        id: sessionID,
        slug: 'fake',
        version: 'fake',
        projectID: 'fake-project',
        directory: url.searchParams.get('directory'),
        title: body?.title || 'fake',
        time: { created: Date.now(), updated: Date.now() },
      });
      sendEvent(clients, { type: 'session.created', properties: { info: { id: sessionID } } });
      return;
    }
    const sessionMatch = url.pathname.match(/^\\/session\\/([^/]+)$/);
    if (req.method === 'GET' && sessionMatch) {
      if (process.env.OPENCODE_FAKE_MODE === 'missing-session') {
        sendJson(res, 404, { error: 'No conversation found with session ID: ' + sessionMatch[1] });
        return;
      }
      sendJson(res, 200, { id: sessionMatch[1], title: 'existing' });
      return;
    }
    const abortMatch = url.pathname.match(/^\\/session\\/([^/]+)\\/abort$/);
    if (req.method === 'POST' && abortMatch) {
      record({ type: 'abort', sessionID: abortMatch[1], query: Object.fromEntries(url.searchParams.entries()) });
      sendJson(res, 200, true);
      return;
    }
    const messageMatch = url.pathname.match(/^\\/session\\/([^/]+)\\/message$/);
    if (req.method === 'POST' && messageMatch) {
      if (process.env.OPENCODE_FAKE_MODE === 'missing-session') {
        sendJson(res, 404, { error: 'No conversation found with session ID: ' + messageMatch[1] });
        return;
      }
      const body = await readBody(req);
      record({ type: 'message-body', sessionID: messageMatch[1], query: Object.fromEntries(url.searchParams.entries()), body });
      const text = process.env.OPENCODE_FAKE_MESSAGE || 'fake app-server response';
      const prompt = (body && body.parts && body.parts[0] && body.parts[0].text) || 'hello';
      const turnNumber = ++messageCounter;
      const userMessageID = 'msg_user_' + turnNumber;
      const assistantMessageID = 'msg_assistant_' + turnNumber;
      const userPartID = 'prt_user_' + turnNumber;
      const reasoningPartID = 'prt_reason_' + turnNumber;
      const textPartID = 'prt_text_' + turnNumber;
      if (process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'empty-no-idle') {
        sendEvent(clients, { type: 'message.updated', properties: { info: { id: userMessageID, sessionID: messageMatch[1], role: 'user' } } });
        sendEvent(clients, { type: 'message.updated', properties: { info: { id: assistantMessageID, sessionID: messageMatch[1], role: 'assistant' } } });
        sendJson(res, 200, {
          info: {
            id: assistantMessageID,
            sessionID: messageMatch[1],
            role: 'assistant',
            tokens: { input: 3, output: 0, cache: { read: 0, write: 0 }, reasoning: 0 },
          },
          parts: [],
        });
        return;
      }
      if (process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'session-error') {
        sendJson(res, 200, null);
        await new Promise((resolve) => setTimeout(resolve, 25));
        sendEvent(clients, { type: 'session.error', properties: { sessionID: messageMatch[1], error: { message: 'fake provider failure' } } });
        return;
      }
      if (process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'structured-session-quota') {
        sendJson(res, 200, null);
        await new Promise((resolve) => setTimeout(resolve, 25));
        sendEvent(clients, {
          type: 'session.error',
          properties: {
            sessionID: messageMatch[1],
            error: {
              message: 'Provider authentication failed',
              statusCode: 429,
              responseBody: {
                error: {
                  status: 'RESOURCE_EXHAUSTED',
                  message: 'Quota exceeded for prompt-body-that-must-not-leak sk-test-secret',
                },
              },
            },
          },
        });
        return;
      }
      if (process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'provider-log-quota') {
        console.error('ERROR service=llm error={"name":"AI_APICallError","statusCode":429,"responseBody":{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for prompt-body-that-must-not-leak sk-test-secret"}}} stream error');
        return;
      }
      const sendNullBeforeEvents = process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'null-before-events';
      if (sendNullBeforeEvents) {
        sendJson(res, 200, null);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      // Simulate real opencode: user message first, then assistant
      sendEvent(clients, { type: 'message.updated', properties: { info: { id: userMessageID, sessionID: messageMatch[1], role: 'user' } } });
      sendEvent(clients, { type: 'message.part.updated', properties: { part: { id: userPartID, sessionID: messageMatch[1], messageID: userMessageID, type: 'text', text: '[MODE]Casting...[/MODE]\\n' + prompt } } });
      sendEvent(clients, { type: 'message.updated', properties: { info: { id: assistantMessageID, sessionID: messageMatch[1], role: 'assistant' } } });
      sendEvent(clients, { type: 'message.part.updated', properties: { part: { id: reasoningPartID, sessionID: messageMatch[1], messageID: assistantMessageID, type: 'reasoning', text: 'thinking' } } });
      const snapshotFirst = process.env.OPENCODE_FAKE_EVENT_ORDER === 'snapshot-first';
      if (snapshotFirst) {
        sendEvent(clients, { type: 'message.part.updated', properties: { part: { id: textPartID, sessionID: messageMatch[1], messageID: assistantMessageID, type: 'text', text } } });
      }
      // Emit delta events for the assistant text part
      sendEvent(clients, { type: 'message.part.delta', properties: { sessionID: messageMatch[1], messageID: assistantMessageID, partID: textPartID, field: 'text', delta: text.slice(0, Math.ceil(text.length / 2)) } });
      if (process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'output-no-idle') {
        return;
      }
      sendEvent(clients, { type: 'message.part.delta', properties: { sessionID: messageMatch[1], messageID: assistantMessageID, partID: textPartID, field: 'text', delta: text.slice(Math.ceil(text.length / 2)) } });
      if (!snapshotFirst) {
        sendEvent(clients, { type: 'message.part.updated', properties: { part: { id: textPartID, sessionID: messageMatch[1], messageID: assistantMessageID, type: 'text', text } } });
      }
      const delayTerminalEvent = process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'response-before-idle'
        || process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'response-before-session-error';
      if (!delayTerminalEvent) {
        sendEvent(clients, { type: 'session.idle', properties: { sessionID: messageMatch[1] } });
      }
      if (sendNullBeforeEvents) {
        return;
      }
      if (process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'hang-after-events') {
        return;
      }
      if (process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'null') {
        sendJson(res, 200, null);
        return;
      }
      sendJson(res, 200, {
        info: {
          id: assistantMessageID,
          sessionID: messageMatch[1],
          role: 'assistant',
          tokens: { input: 3, output: 4, cache: { read: 0, write: 0 }, reasoning: 0 },
        },
        parts: [
          { id: reasoningPartID, sessionID: messageMatch[1], messageID: assistantMessageID, type: 'reasoning', text: 'thinking' },
          { id: textPartID, sessionID: messageMatch[1], messageID: assistantMessageID, type: 'text', text },
        ],
      });
      if (process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'response-before-idle') {
        setTimeout(() => sendEvent(clients, { type: 'session.idle', properties: { sessionID: messageMatch[1] } }), 75);
      }
      if (process.env.OPENCODE_FAKE_MESSAGE_RESPONSE === 'response-before-session-error') {
        setTimeout(() => sendEvent(clients, {
          type: 'session.error',
          properties: { sessionID: messageMatch[1], error: { message: 'delayed provider failure' } },
        }), 25);
      }
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  });
  server.listen(port, '127.0.0.1');
  return;
}
if (process.env.OPENCODE_FAKE_MODE === 'missing-session') {
  console.error('No conversation found with session ID: stale-opencode-session');
  process.exit(1);
}
if (process.env.OPENCODE_FAKE_MODE === 'empty') {
  process.exit(0);
}
console.log(JSON.stringify({ type: 'text', part: { text: process.env.OPENCODE_FAKE_MESSAGE || 'fake response' } }));
`, { mode: 0o755 });
  chmodSync(path, 0o755);
}

describe('OpencodeStrategy', () => {
  let _oldHome: string | undefined;
  const savedEnv: Record<string, string | undefined> = {};

  // Keys we may set/clear during tests
  const envKeys = [
    'HOME',
    'PATH',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GOOGLE_API_KEY',
    'OPENROUTER_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENAI_API_BASE',
    'OPENCODE_FAKE_ARGS_PATH',
    'OPENCODE_FAKE_ENV_PATH',
    'OPENCODE_FAKE_MODE',
    'OPENCODE_FAKE_MESSAGE',
    'OPENCODE_FAKE_MESSAGE_RESPONSE',
    'OPENCODE_FAKE_EVENT_ORDER',
    'OPENCODE_FAKE_REPLAY_PREVIOUS_EVENTS',
    'OPENCODE_FAKE_REQUESTS_PATH',
    'OPENCODE_CONFIG_CONTENT',
    'OPENCODE_AGENT_TRANSPORT',
    'OPENCODE_USE_APP_SERVER',
    'OPENCODE_APP_SERVER_TURN_TIMEOUT_MS',
  ] as const;

  beforeEach(() => {
    for (const k of envKeys) savedEnv[k] = process.env[k];
    process.env.HOME = TEST_HOME;
    // Clear all API key env vars so tests start clean
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_BASE;
    delete process.env.OPENCODE_FAKE_ARGS_PATH;
    delete process.env.OPENCODE_FAKE_ENV_PATH;
    delete process.env.OPENCODE_FAKE_MODE;
    delete process.env.OPENCODE_FAKE_MESSAGE;
    delete process.env.OPENCODE_FAKE_MESSAGE_RESPONSE;
    delete process.env.OPENCODE_FAKE_EVENT_ORDER;
    delete process.env.OPENCODE_FAKE_REPLAY_PREVIOUS_EVENTS;
    delete process.env.OPENCODE_FAKE_REQUESTS_PATH;
    delete process.env.OPENCODE_CONFIG_CONTENT;
    delete process.env.OPENCODE_APP_SERVER_TURN_TIMEOUT_MS;
    process.env.OPENCODE_AGENT_TRANSPORT = 'run';
    delete process.env.OPENCODE_USE_APP_SERVER;
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  function makeConnection(): AuthConnection & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      sendAuthUrlGenerated: (url: string) => calls.push(`url:${url}`),
      sendDeviceCode: (code: string) => calls.push(`device:${code}`),
      sendAuthManualToken: () => calls.push('manual_token'),
      sendAuthSuccess: () => calls.push('auth_success'),
      sendAuthStatus: (status: string) => calls.push(`status:${status}`),
      sendError: (msg: string) => calls.push(`error:${msg}`),
    };
  }

  function makeLogoutConnection(): LogoutConnection & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      sendLogoutOutput: (text: string) => calls.push(`output:${text}`),
      sendLogoutSuccess: () => calls.push('logout_success'),
      sendError: (msg: string) => calls.push(`error:${msg}`),
    };
  }

  // ─── Auth modal behaviour ───────────────────────────────────────

  test('executeAuth shows manual token modal when no env key set', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('manual_token');
    expect(conn.calls).not.toContain('auth_success');
  });

  test('executeAuth skips modal when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('auth_success');
    expect(conn.calls).not.toContain('manual_token');
  });

  test('executeAuth skips modal when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('auth_success');
  });

  test('executeAuth skips modal when OPENROUTER_API_KEY is set', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('auth_success');
  });

  test('executeAuth skips modal when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('auth_success');
  });

  test('executeAuth skips modal when GOOGLE_GENERATIVE_AI_API_KEY is set', () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('auth_success');
  });

  test('executeAuth skips modal when GOOGLE_API_KEY is set', () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    expect(conn.calls).toContain('auth_success');
  });

  // ─── Manual key submission ──────────────────────────────────────

  test('submitAuthCode writes auth file and signals success', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('test-api-key-123');
    expect(conn.calls).toContain('auth_success');
    const authFile = join(TEST_HOME, '.local', 'share', 'opencode', 'auth.json');
    expect(existsSync(authFile)).toBe(true);
    expect(JSON.parse(readFileSync(authFile, 'utf8')).provider).toBe('openrouter');
  });

  test('submitAuthCode with empty string sends unauthenticated', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('');
    expect(conn.calls).toContain('status:unauthenticated');
    expect(conn.calls).not.toContain('auth_success');
  });

  test('submitAuthCode with whitespace-only sends unauthenticated', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('   ');
    expect(conn.calls).toContain('status:unauthenticated');
  });

  // ─── checkAuthStatus ───────────────────────────────────────────

  test('checkAuthStatus returns false when no env key and no stored key', async () => {
    const strategy = new OpencodeStrategy();
    expect(await strategy.checkAuthStatus()).toBe(false);
  });

  test('checkAuthStatus returns true when ANTHROPIC_API_KEY env set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const strategy = new OpencodeStrategy();
    expect(await strategy.checkAuthStatus()).toBe(true);
  });

  test('checkAuthStatus returns true after submitAuthCode', async () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('my-key');
    expect(await strategy.checkAuthStatus()).toBe(true);
  });

  test('stored provider metadata selects the provider env key', () => {
    const authDir = join(TEST_HOME, '.local', 'share', 'opencode');
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, 'auth.json'), JSON.stringify({
      api_key: 'test-anthropic-key',
      provider: 'anthropic',
    }));

    const strategy = new OpencodeStrategy();
    const env = (strategy as unknown as { buildOpencodeEnv: () => NodeJS.ProcessEnv }).buildOpencodeEnv();

    expect(env.ANTHROPIC_API_KEY).toBe('test-anthropic-key');
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
  });

  test('stored Gemini provider metadata sets all Google env aliases', () => {
    const authDir = join(TEST_HOME, '.local', 'share', 'opencode');
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, 'auth.json'), JSON.stringify({
      api_key: 'test-gemini-key',
      provider: 'gemini',
    }));

    const strategy = new OpencodeStrategy();
    const env = (strategy as unknown as { buildOpencodeEnv: () => NodeJS.ProcessEnv }).buildOpencodeEnv();

    expect(env.GEMINI_API_KEY).toBe('test-gemini-key');
    expect(env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('test-gemini-key');
    expect(env.GOOGLE_API_KEY).toBe('test-gemini-key');
  });

  test('stored custom provider metadata applies base URL config', () => {
    const authDir = join(TEST_HOME, '.local', 'share', 'opencode');
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, 'auth.json'), JSON.stringify({
      api_key: 'test-custom-key',
      provider: 'custom-anthropic',
      base_url: 'https://anthropic-proxy.example.test/v1',
    }));

    const strategy = new OpencodeStrategy();
    const env = (strategy as unknown as { buildOpencodeEnv: () => NodeJS.ProcessEnv }).buildOpencodeEnv();
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? '{}');

    expect(env.ANTHROPIC_API_KEY).toBe('test-custom-key');
    expect(config.provider.anthropic.options.baseURL).toBe('https://anthropic-proxy.example.test/v1');
  });

  // ─── cancelAuth / clearCredentials / logout ─────────────────────

  test('cancelAuth prevents subsequent submitAuthCode from signaling', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.cancelAuth();
    strategy.submitAuthCode('key');
    expect(conn.calls).toEqual(['manual_token']);
  });

  test('clearCredentials removes auth file', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('my-key');
    const authFile = join(TEST_HOME, '.local', 'share', 'opencode', 'auth.json');
    expect(existsSync(authFile)).toBe(true);
    strategy.clearCredentials();
    expect(existsSync(authFile)).toBe(false);
  });

  test('executeLogout clears credentials and signals success', () => {
    const strategy = new OpencodeStrategy();
    const logoutConn = makeLogoutConnection();
    strategy.executeLogout(logoutConn);
    expect(logoutConn.calls).toContain('logout_success');
  });

  // ─── getModelArgs ──────────────────────────────────────────────

  test('getModelArgs returns --model flag without prefix when no OpenRouter key', () => {
    const strategy = new OpencodeStrategy();
    expect(strategy.getModelArgs('anthropic/claude-sonnet-4')).toEqual([
      '--model',
      'anthropic/claude-sonnet-4',
    ]);
  });

  test('getModelArgs auto-prefixes openrouter/ when OPENROUTER_API_KEY is set', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    expect(strategy.getModelArgs('openai/gpt-5.4')).toEqual([
      '--model',
      'openrouter/openai/gpt-5.4',
    ]);
  });

  test('getModelArgs does not double-prefix when model already has openrouter/', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const strategy = new OpencodeStrategy();
    expect(strategy.getModelArgs('openrouter/openai/gpt-5.4')).toEqual([
      '--model',
      'openrouter/openai/gpt-5.4',
    ]);
  });

  test('getModelArgs returns empty array for empty model', () => {
    const strategy = new OpencodeStrategy();
    expect(strategy.getModelArgs('')).toEqual([]);
  });

  test('getModelArgs returns empty for undefined model', () => {
    const strategy = new OpencodeStrategy();
    expect(strategy.getModelArgs('undefined')).toEqual([]);
  });

  test('interruptAgent does not throw', () => {
    const strategy = new OpencodeStrategy();
    strategy.interruptAgent();
  });

  test('uses the default app-server turn timeout when no override is set', () => {
    expect(resolveOpencodeAppServerTurnTimeoutMs()).toBe(60 * 1000);
  });

  test('uses OPENCODE_APP_SERVER_TURN_TIMEOUT_MS when set to a positive integer', () => {
    process.env.OPENCODE_APP_SERVER_TURN_TIMEOUT_MS = '180000';
    expect(resolveOpencodeAppServerTurnTimeoutMs()).toBe(180000);
  });

  test('ignores invalid OPENCODE_APP_SERVER_TURN_TIMEOUT_MS values', () => {
    process.env.OPENCODE_APP_SERVER_TURN_TIMEOUT_MS = '0';
    expect(resolveOpencodeAppServerTurnTimeoutMs()).toBe(60 * 1000);

    process.env.OPENCODE_APP_SERVER_TURN_TIMEOUT_MS = 'not-a-number';
    expect(resolveOpencodeAppServerTurnTimeoutMs()).toBe(60 * 1000);
  });

  test('constructor with conversationDataDir', () => {
    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'conv-data'),
      getEncryptionKey: () => undefined,
    });
    expect(strategy).toBeDefined();
  });

  test('getModelArgs auto-prefixes when stored OpenRouter key is active', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('sk-or-test-openrouter-key');
    const args = strategy.getModelArgs('openai/gpt-5.4');
    expect(args).toEqual(['--model', 'openrouter/openai/gpt-5.4']);
  });

  test('getModelArgs does not prefix when stored OpenAI key is active', () => {
    const authDir = join(TEST_HOME, '.local', 'share', 'opencode');
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, 'auth.json'), JSON.stringify({
      api_key: 'sk-test-openai-key',
      provider: 'openai',
    }));

    const strategy = new OpencodeStrategy();
    const args = strategy.getModelArgs('openai/gpt-5.4');
    expect(args).toEqual(['--model', 'openai/gpt-5.4']);
  });

  test('executePromptStreaming defaults to opencode app-server transport', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    delete process.env.OPENCODE_AGENT_TRANSPORT;
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const argsPath = join(TEST_HOME, 'opencode-default-args.json');
    process.env.OPENCODE_FAKE_ARGS_PATH = argsPath;

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'default-transport-conv'),
      getEncryptionKey: () => undefined,
    });

    await strategy.executePromptStreaming('hello', 'openai/gpt-5.4', () => undefined);

    const args = JSON.parse(readFileSync(argsPath, 'utf8'));
    expect(args[0]).toBe('serve');
    expect(args).toContain('--print-logs');
  });

  test('clearCredentials is safe when no auth file exists', () => {
    const strategy = new OpencodeStrategy();
    strategy.clearCredentials();
  });

  test('executePromptStreaming clears stale session marker when OpenCode reports missing conversation', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const argsPath = join(TEST_HOME, 'opencode-args.json');
    process.env.OPENCODE_FAKE_ARGS_PATH = argsPath;
    process.env.OPENCODE_FAKE_MODE = 'missing-session';

    const convDir = join(TEST_HOME, 'missing-session-conv');
    const workspaceDir = join(convDir, 'opencode_workspace');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(convDir, '.opencode_session'), 'legacy');

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => convDir,
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('continue', 'openai/gpt-5.4', () => undefined)).rejects.toThrow(
      'No conversation found with session ID: stale-opencode-session'
    );
    expect(JSON.parse(readFileSync(argsPath, 'utf8'))).toEqual([
      'run',
      '--continue',
      '--model',
      'openai/gpt-5.4',
      '--thinking',
      '--format',
      'json',
      '--',
      'continue',
    ]);
    expect(existsSync(join(convDir, '.opencode_session'))).toBe(false);
  });

  test('executePromptStreaming preserves MCP servers in OPENCODE_CONFIG_CONTENT', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
      mcpServers: {
        fibe: { command: 'fibe', args: ['mcp', 'serve'] },
      },
    });

    const envPath = join(TEST_HOME, 'opencode-env.json');
    process.env.OPENCODE_FAKE_ENV_PATH = envPath;

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'mcp-config-conv'),
      getEncryptionKey: () => undefined,
    });

    await strategy.executePromptStreaming('hello', 'openai/gpt-5.4', () => undefined);

    const config = JSON.parse(readFileSync(envPath, 'utf8'));
    expect(config.permission).toBe('allow');
    expect(config.autoupdate).toBe(false);
    expect(config.share).toBe('disabled');
    expect(config.mcpServers.fibe).toEqual({ command: 'fibe', args: ['mcp', 'serve'] });
  });

  test('executePromptStreaming uses OpenCode serve app-server with shared workspace and per-conversation session marker', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const requestsPath = join(TEST_HOME, 'opencode-requests.jsonl');
    process.env.OPENCODE_FAKE_REQUESTS_PATH = requestsPath;
    const defaultDir = join(TEST_HOME, 'default-data');
    const convDir = join(TEST_HOME, 'conversation-data');
    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => convDir,
      getDefaultConversationDataDir: () => defaultDir,
      getConversationId: () => 'conversation-a',
      getEncryptionKey: () => undefined,
    });

    const chunks: string[] = [];
    const reasoning: string[] = [];
    await strategy.executePromptStreaming(
      'hello',
      'openai/gpt-5.4',
      (chunk) => chunks.push(chunk),
      { onReasoningChunk: (chunk) => reasoning.push(chunk) },
    );

    const joinedChunks = chunks.join('');
    expect(joinedChunks).toContain('fake app-server response');
    // Ensure text is not duplicated (dedup works correctly)
    expect(joinedChunks).not.toBe('fake app-server responsefake app-server response');
    expect(reasoning.join('')).toContain('thinking');
    expect(readFileSync(join(convDir, '.opencode_session'), 'utf8')).toBe('ses_fakeOpenCodeSession');
    expect(existsSync(join(defaultDir, 'opencode_workspace', 'opencode.json'))).toBe(true);
    expect(existsSync(join(convDir, 'opencode_workspace'))).toBe(false);

    const requests = readFileSync(requestsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type?: string; path?: string; query?: Record<string, string>; body?: Record<string, unknown> });
    const messageRequest = requests.find((request) => request.type === 'message-body');
    expect(messageRequest?.body?.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.4' });
    expect(messageRequest?.query?.directory).toBe(join(defaultDir, 'opencode_workspace'));
  });

  test('executePromptStreaming dedupes deltas that arrive after a full text snapshot', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_EVENT_ORDER = 'snapshot-first';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'snapshot-first-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'conversation-snapshot-first',
      getEncryptionKey: () => undefined,
    });

    const chunks: string[] = [];
    await strategy.executePromptStreaming('hello', 'openai/gpt-5.4', (chunk) => chunks.push(chunk));

    expect(chunks.join('')).toBe('fake app-server response');
  });

  test('executePromptStreaming accepts null app-server message responses when SSE delivered output', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_MESSAGE_RESPONSE = 'null';
    process.env.OPENCODE_FAKE_MESSAGE = 'sse-only response';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'null-message-response-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'null-message-response',
      getEncryptionKey: () => undefined,
    });

    const chunks: string[] = [];
    await strategy.executePromptStreaming('hello', 'openai/gpt-5.4', (chunk) => chunks.push(chunk));

    expect(chunks.join('')).toContain('sse-only response');
  });

  test('executePromptStreaming waits for SSE output when app-server responds before events', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_MESSAGE_RESPONSE = 'null-before-events';
    process.env.OPENCODE_FAKE_MESSAGE = 'delayed sse response';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'delayed-null-message-response-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'delayed-null-message-response',
      getEncryptionKey: () => undefined,
    });

    const chunks: string[] = [];
    await strategy.executePromptStreaming('hello', 'openai/gpt-5.4', (chunk) => chunks.push(chunk));

    expect(chunks.join('')).toContain('delayed sse response');
  });

  test('executePromptStreaming completes from SSE output when app-server message POST does not finish', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_MESSAGE_RESPONSE = 'hang-after-events';
    process.env.OPENCODE_FAKE_MESSAGE = 'sse post hang response';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'hanging-message-post-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'hanging-message-post',
      getEncryptionKey: () => undefined,
    });

    const chunks: string[] = [];
    await strategy.executePromptStreaming('hello', 'openai/gpt-5.4', (chunk) => chunks.push(chunk));

    expect(chunks.join('')).toContain('sse post hang response');
  });

  test('executePromptStreaming waits for app-server idle after streamed output', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_MESSAGE_RESPONSE = 'output-no-idle';
    process.env.OPENCODE_FAKE_MESSAGE = 'partial output without idle';
    process.env.OPENCODE_APP_SERVER_TURN_TIMEOUT_MS = '50';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'output-no-idle-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'output-no-idle',
      getEncryptionKey: () => undefined,
    });

    const chunks: string[] = [];
    await expect(strategy.executePromptStreaming('hello', 'openai/gpt-5.4', (chunk) => chunks.push(chunk))).rejects.toThrow(
      'no session.idle or session.error received after assistant output',
    );
    expect(chunks.join('')).toContain('partial output');
  });

  test('executePromptStreaming waits for app-server idle after a JSON response', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_MESSAGE_RESPONSE = 'response-before-idle';
    process.env.OPENCODE_FAKE_MESSAGE = 'json response before idle';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'response-before-idle-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'response-before-idle',
      getEncryptionKey: () => undefined,
    });

    const startedAt = Date.now();
    const chunks: string[] = [];
    await strategy.executePromptStreaming('hello', 'openai/gpt-5.4', (chunk) => chunks.push(chunk));

    expect(chunks.join('')).toContain('json response before idle');
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(50);
  });

  test('executePromptStreaming surfaces app-server session errors after a JSON response', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_MESSAGE_RESPONSE = 'response-before-session-error';
    process.env.OPENCODE_FAKE_MESSAGE = 'json response before delayed error';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'response-before-session-error-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'response-before-session-error',
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', 'openai/gpt-5.4', () => undefined)).rejects.toThrow(
      'delayed provider failure',
    );
  });

  test('executePromptStreaming times out and clears session when app-server returns no output or idle event', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_MESSAGE_RESPONSE = 'empty-no-idle';
    process.env.OPENCODE_APP_SERVER_TURN_TIMEOUT_MS = '50';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const convDir = join(TEST_HOME, 'empty-no-idle-conv');
    mkdirSync(convDir, { recursive: true });
    writeFileSync(join(convDir, '.opencode_session'), 'ses_existingOpenCodeSession');
    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => convDir,
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'empty-no-idle',
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', 'openai/gpt-5.4', () => undefined)).rejects.toThrow(
      'OpenCode app-server turn timed out after 50ms',
    );
    expect(existsSync(join(convDir, '.opencode_session'))).toBe(false);
  });

  test('executePromptStreaming surfaces app-server session errors', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_MESSAGE_RESPONSE = 'session-error';
    process.env.OPENCODE_APP_SERVER_TURN_TIMEOUT_MS = '1000';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'session-error-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'session-error',
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', 'openai/gpt-5.4', () => undefined)).rejects.toThrow(
      'fake provider failure',
    );
  });

  test('executePromptStreaming surfaces OpenCode app-server provider output failures without prompt leakage', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_MESSAGE_RESPONSE = 'provider-log-quota';
    process.env.OPENCODE_APP_SERVER_TURN_TIMEOUT_MS = '2000';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'provider-log-quota-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'provider-log-quota',
      getEncryptionKey: () => undefined,
    });

    let message = '';
    try {
      await strategy.executePromptStreaming('hello', 'openai/gpt-5.4', () => undefined);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('OpenCode provider quota/rate limit exhausted');
    expect(message).not.toContain('prompt-body-that-must-not-leak');
    expect(message).not.toContain('sk-test-secret');
  });

  test('executePromptStreaming classifies structured app-server quota errors before auth-like messages', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_MESSAGE_RESPONSE = 'structured-session-quota';
    process.env.OPENCODE_APP_SERVER_TURN_TIMEOUT_MS = '2000';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'structured-session-quota-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'structured-session-quota',
      getEncryptionKey: () => undefined,
    });

    let message = '';
    try {
      await strategy.executePromptStreaming('hello', 'google/gemini-2.5-flash-lite', () => undefined);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('OpenCode provider quota/rate limit exhausted');
    expect(message).not.toContain('OpenCode provider authentication failed');
    expect(message).not.toContain('prompt-body-that-must-not-leak');
    expect(message).not.toContain('sk-test-secret');
  });

  test('executePromptStreaming posts one OpenCode app-server message per user turn', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const requestsPath = join(TEST_HOME, 'opencode-sequential-requests.jsonl');
    process.env.OPENCODE_FAKE_REQUESTS_PATH = requestsPath;

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'opencode-sequential-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'opencode-sequential',
      getEncryptionKey: () => undefined,
    });
    const chunks: string[] = [];

    process.env.OPENCODE_FAKE_MESSAGE = 'first opencode response';
    await strategy.executePromptStreaming('first turn', 'openai/gpt-5.4', (chunk) => chunks.push(chunk));
    process.env.OPENCODE_FAKE_MESSAGE = 'second opencode response';
    await strategy.executePromptStreaming('second turn', 'openai/gpt-5.4', (chunk) => chunks.push(chunk));

    const requests = readFileSync(requestsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type?: string; path?: string; body?: { parts?: Array<{ text?: string }> } });
    const messageRequests = requests.filter((request) => request.type === 'message-body');
    expect(chunks.join('')).toBe('first opencode responsesecond opencode response');
    expect(messageRequests).toHaveLength(2);
    expect(messageRequests[0].body?.parts?.[0]?.text).toBe('first turn');
    expect(messageRequests[1].body?.parts?.[0]?.text).toBe('second turn');
    expect(requests.filter((request) => request.type === 'create-session-body')).toHaveLength(1);
    expect(requests.some((request) => request.path === '/session/ses_fakeOpenCodeSession')).toBe(true);
  });

  test('executePromptStreaming ignores replayed app-server events before the current user turn', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.OPENCODE_FAKE_REPLAY_PREVIOUS_EVENTS = '1';
    process.env.OPENCODE_FAKE_MESSAGE = 'current opencode response';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const requestsPath = join(TEST_HOME, 'opencode-replay-requests.jsonl');
    process.env.OPENCODE_FAKE_REQUESTS_PATH = requestsPath;

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'opencode-replay-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'opencode-replay',
      getEncryptionKey: () => undefined,
    });
    const chunks: string[] = [];

    await strategy.executePromptStreaming('current turn', 'openai/gpt-5.4', (chunk) => chunks.push(chunk));

    const requests = readFileSync(requestsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type?: string; body?: { parts?: Array<{ text?: string }> } });
    const messageRequests = requests.filter((request) => request.type === 'message-body');
    expect(chunks.join('')).toBe('current opencode response');
    expect(chunks.join('')).not.toContain('stale replay response');
    expect(messageRequests).toHaveLength(1);
    expect(messageRequests[0].body?.parts?.[0]?.text).toBe('current turn');
  });

  test('executePromptStreaming app-server clears stale OpenCode session marker on missing session', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENCODE_FAKE_MODE = 'missing-session';

    const convDir = join(TEST_HOME, 'stale-app-server-conv');
    mkdirSync(convDir, { recursive: true });
    writeFileSync(join(convDir, '.opencode_session'), 'ses_staleOpenCodeSession');
    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => convDir,
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'conversation-b',
      getEncryptionKey: () => undefined,
    });

    await expect(strategy.executePromptStreaming('hello', 'openai/gpt-5.4', () => undefined)).rejects.toThrow(
      'No conversation found with session ID: ses_staleOpenCodeSession',
    );
    expect(existsSync(join(convDir, '.opencode_session'))).toBe(false);
  });

  test('steerAgent degrades to queued app-server input for OpenCode', async () => {
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const requestsPath = join(TEST_HOME, 'opencode-steer-requests.jsonl');
    process.env.OPENCODE_FAKE_REQUESTS_PATH = requestsPath;

    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'steer-conv'),
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'conversation-c',
      getEncryptionKey: () => undefined,
    });
    strategy.steerAgent('adjust course');

    await strategy.executePromptStreaming('continue', 'openai/gpt-5.4', () => undefined);

    const requests = readFileSync(requestsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type?: string; body?: { parts?: Array<{ text?: string }> } });
    const messageRequest = requests.find((request) => request.type === 'message-body');
    expect(messageRequest?.body?.parts?.[0]?.text).toContain('[Operator Interruption]');
    expect(messageRequest?.body?.parts?.[0]?.text).toContain('adjust course');
    expect(messageRequest?.body?.parts?.[0]?.text).toContain('continue');
  });
});

// ─── User-message filtering & MODE tag stripping ────────────────────────────

describe('OpencodeStrategy app-server SSE filtering', () => {
  const savedFilterEnv: Record<string, string | undefined> = {};
  const filterEnvKeys = [
    'HOME', 'PATH', 'ANTHROPIC_API_KEY', 'OPENCODE_AGENT_TRANSPORT',
    'OPENCODE_FAKE_MESSAGE', 'OPENCODE_FAKE_MESSAGE_RESPONSE', 'OPENCODE_FAKE_ENV_PATH', 'OPENCODE_FAKE_ARGS_PATH',
    'OPENCODE_FAKE_MODE', 'OPENCODE_FAKE_REQUESTS_PATH', 'OPENCODE_CONFIG_CONTENT',
    'OPENCODE_USE_APP_SERVER', 'OPENCODE_FAKE_SESSION_ID',
  ] as const;

  beforeEach(() => {
    for (const k of filterEnvKeys) savedFilterEnv[k] = process.env[k];
    process.env.HOME = TEST_HOME;
    process.env.OPENCODE_AGENT_TRANSPORT = 'app-server';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.OPENCODE_FAKE_MODE;
    delete process.env.OPENCODE_FAKE_MESSAGE;
    delete process.env.OPENCODE_FAKE_MESSAGE_RESPONSE;
    if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true, force: true });
    mkdirSync(TEST_HOME, { recursive: true });
    const fakeBinDir = join(TEST_HOME, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeOpencode(join(fakeBinDir, 'opencode'));
    process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ''}`;
  });

  afterEach(() => {
    for (const k of filterEnvKeys) {
      if (savedFilterEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedFilterEnv[k];
    }
    if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true, force: true });
  });

  function makeFilterStrategy(convDir: string) {
    return new OpencodeStrategy({
      getConversationDataDir: () => convDir,
      getDefaultConversationDataDir: () => join(TEST_HOME, 'default-data'),
      getConversationId: () => 'filter-test-conv',
      getEncryptionKey: () => undefined,
    });
  }

  test('does not echo the user prompt in assistant chunks', async () => {
    const convDir = join(TEST_HOME, 'filter-conv-1');
    const strategy = makeFilterStrategy(convDir);
    const chunks: string[] = [];
    await strategy.executePromptStreaming('say only hi', 'openai/gpt-5.4', (c) => chunks.push(c));
    const joined = chunks.join('');
    expect(joined).not.toContain('say only hi');
    expect(joined).toContain('fake app-server response');
    expect(joined).not.toContain('say only hi');
  });

  test('user-message text part with [MODE] prefix is excluded from assistant chunks', async () => {
    // The fake server emits a user-message part: "[MODE]Casting...[/MODE]\n<prompt>"
    // This must never appear in the assistant output chunks
    const convDir = join(TEST_HOME, 'filter-conv-2');
    const strategy = makeFilterStrategy(convDir);
    const chunks: string[] = [];
    await strategy.executePromptStreaming('unique-test-prompt-xyz', 'openai/gpt-5.4', (c) => chunks.push(c));
    const joined = chunks.join('');
    expect(joined).not.toContain('[MODE]');
    expect(joined).not.toContain('[/MODE]');
    expect(joined).not.toContain('unique-test-prompt-xyz');
    // Assistant text should still come through
    expect(joined).toContain('fake app-server response');
  });

  test('assistant content streams via deltas without user prompt contamination', async () => {
    process.env.OPENCODE_FAKE_MESSAGE = 'DELTA_RESPONSE';
    const convDir = join(TEST_HOME, 'filter-conv-3');
    const strategy = makeFilterStrategy(convDir);
    const chunks: string[] = [];
    await strategy.executePromptStreaming('my secret prompt', 'openai/gpt-5.4', (c) => chunks.push(c));
    const joined = chunks.join('');
    expect(joined).not.toContain('my secret prompt');
    expect(joined).toContain('DELTA_RESPONSE');
  });

  test('reasoning chunks stream separately without user prompt contamination', async () => {
    const convDir = join(TEST_HOME, 'filter-conv-4');
    const strategy = makeFilterStrategy(convDir);
    const chunks: string[] = [];
    const reasoning: string[] = [];
    await strategy.executePromptStreaming(
      'think and respond',
      'openai/gpt-5.4',
      (c) => chunks.push(c),
      { onReasoningChunk: (c) => reasoning.push(c) },
    );
    expect(reasoning.join('')).toContain('thinking');
    expect(chunks.join('')).not.toContain('think and respond');
    expect(chunks.join('')).toContain('fake app-server response');
  });
});

describe('buildOpencodeRunArgs', () => {
  test('places `--` immediately before the prompt so opencode treats it as a positional', () => {
    const args = buildOpencodeRunArgs('hello', ['--model', 'openai/gpt-5.4'], false);
    expect(args).toEqual([
      'run',
      '--model',
      'openai/gpt-5.4',
      '--thinking',
      '--format',
      'json',
      '--',
      'hello',
    ]);
  });

  test('still delimits the prompt with `--` when it starts with a dash (markdown bullet)', () => {
    const dashPrompt = '- bullet from system prompt\n[SYSCHECK]';
    const args = buildOpencodeRunArgs(dashPrompt, ['--model', 'openai/gpt-5.4'], false);
    const separatorIndex = args.indexOf('--');
    expect(separatorIndex).toBeGreaterThan(-1);
    expect(args[separatorIndex + 1]).toBe(dashPrompt);
    expect(args[args.length - 1]).toBe(dashPrompt);
  });

  test('includes --continue when hasSession is true', () => {
    const args = buildOpencodeRunArgs('hi', [], true);
    expect(args).toEqual(['run', '--continue', '--thinking', '--format', 'json', '--', 'hi']);
  });
});

describe('buildOpencodeRunArgs', () => {
  test('places `--` immediately before the prompt so opencode treats it as a positional', () => {
    const args = buildOpencodeRunArgs('hello', ['--model', 'openai/gpt-5.4'], false);
    expect(args).toEqual([
      'run',
      '--model',
      'openai/gpt-5.4',
      '--thinking',
      '--format',
      'json',
      '--',
      'hello',
    ]);
  });

  test('still delimits the prompt with `--` when it starts with a dash (markdown bullet)', () => {
    const dashPrompt = '- bullet from system prompt\n[SYSCHECK]';
    const args = buildOpencodeRunArgs(dashPrompt, ['--model', 'openai/gpt-5.4'], false);
    const separatorIndex = args.indexOf('--');
    expect(separatorIndex).toBeGreaterThan(-1);
    expect(args[separatorIndex + 1]).toBe(dashPrompt);
    expect(args[args.length - 1]).toBe(dashPrompt);
  });

  test('includes --continue when hasSession is true', () => {
    const args = buildOpencodeRunArgs('hi', [], true);
    expect(args).toEqual(['run', '--continue', '--thinking', '--format', 'json', '--', 'hi']);
  });
});
