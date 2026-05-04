import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OpencodeStrategy, buildOpencodeRunArgs } from './opencode.strategy';
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
      sendEvent(clients, { type: 'message.part.updated', properties: { part: { id: 'prt_reason', sessionID: messageMatch[1], messageID: 'msg_assistant', type: 'reasoning', text: 'thinking' } } });
      sendEvent(clients, { type: 'message.part.updated', properties: { part: { id: 'prt_text', sessionID: messageMatch[1], messageID: 'msg_assistant', type: 'text', text } } });
      sendEvent(clients, { type: 'session.idle', properties: { sessionID: messageMatch[1] } });
      sendJson(res, 200, {
        info: {
          id: 'msg_assistant',
          sessionID: messageMatch[1],
          role: 'assistant',
          tokens: { input: 3, output: 4, cache: { read: 0, write: 0 }, reasoning: 0 },
        },
        parts: [{ id: 'prt_text', sessionID: messageMatch[1], messageID: 'msg_assistant', type: 'text', text }],
      });
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
    'OPENROUTER_API_KEY',
    'OPENAI_API_BASE',
    'OPENCODE_FAKE_ARGS_PATH',
    'OPENCODE_FAKE_ENV_PATH',
    'OPENCODE_FAKE_MODE',
    'OPENCODE_FAKE_MESSAGE',
    'OPENCODE_FAKE_REQUESTS_PATH',
    'OPENCODE_CONFIG_CONTENT',
    'OPENCODE_AGENT_TRANSPORT',
    'OPENCODE_USE_APP_SERVER',
  ] as const;

  beforeEach(() => {
    for (const k of envKeys) savedEnv[k] = process.env[k];
    process.env.HOME = TEST_HOME;
    // Clear all API key env vars so tests start clean
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_BASE;
    delete process.env.OPENCODE_FAKE_ARGS_PATH;
    delete process.env.OPENCODE_FAKE_ENV_PATH;
    delete process.env.OPENCODE_FAKE_MODE;
    delete process.env.OPENCODE_FAKE_MESSAGE;
    delete process.env.OPENCODE_FAKE_REQUESTS_PATH;
    delete process.env.OPENCODE_CONFIG_CONTENT;
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

  // ─── Manual key submission ──────────────────────────────────────

  test('submitAuthCode writes auth file and signals success', () => {
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('test-api-key-123');
    expect(conn.calls).toContain('auth_success');
    const authFile = join(TEST_HOME, '.local', 'share', 'opencode', 'auth.json');
    expect(existsSync(authFile)).toBe(true);
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

  test('constructor with conversationDataDir', () => {
    const strategy = new OpencodeStrategy({
      getConversationDataDir: () => join(TEST_HOME, 'conv-data'),
      getEncryptionKey: () => undefined,
    });
    expect(strategy).toBeDefined();
  });

  test('getModelArgs auto-prefixes when stored key is active', () => {
    // Submit a key to set stored key
    const strategy = new OpencodeStrategy();
    const conn = makeConnection();
    strategy.executeAuth(conn);
    strategy.submitAuthCode('test-openrouter-key');
    // Should auto-prefix because stored key is active and no env keys
    const args = strategy.getModelArgs('openai/gpt-5.4');
    expect(args).toEqual(['--model', 'openrouter/openai/gpt-5.4']);
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

    expect(chunks.join('')).toBe('fake app-server response');
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
