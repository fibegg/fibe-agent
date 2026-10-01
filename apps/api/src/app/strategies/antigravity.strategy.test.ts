import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  AntigravityStrategy,
  buildAntigravityArgs,
} from './antigravity.strategy';
import type { AuthConnection, ToolEvent } from './strategy.types';

describe('Antigravity CLI contract', () => {
  let home: string;
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agy-contract-'));
    env = { ...process.env };
    for (const key of [
      'ANTIGRAVITY_HOME',
      'PROVIDER_ARGS',
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
      'AGY_EVENTS',
      'AGY_EXIT',
      'AGY_AUTH',
    ])
      delete process.env[key];
    process.env.SESSION_DIR = join(home, '.gemini');
    const bin = join(home, 'agy');
    writeFileSync(
      bin,
      `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.HOME + '/args.json', JSON.stringify(process.argv.slice(2)));
if (process.argv[2] === 'models') { console.log('gemini-3.8-flash-high  Gemini Flash\\nclaude-sonnet-4-6 Claude Sonnet\\ngemini-3.8-flash-high duplicate'); }
else if (process.env.AGY_AUTH === '1') {
  if (!process.stdin.isTTY) process.exit(9);
  console.log('https://accounts.google.com/o/oauth2/auth?test=1');
  process.stdin.on('data', () => { console.log('authenticated'); process.exit(0); });
} else {
  if (process.env.GEMINI_API_KEY) fs.writeFileSync(process.env.HOME + '/key.txt', 'present');
  (async () => { for (const event of JSON.parse(process.env.AGY_EVENTS || '[]')) {
    console.log(typeof event === 'string' ? event : JSON.stringify(event));
    await new Promise(r => setTimeout(r, 30));
  } process.exit(Number(process.env.AGY_EXIT || 0)); })();
}
`,
    );
    chmodSync(bin, 0o755);
    process.env.ANTIGRAVITY_BIN = bin;
  });
  afterEach(() => {
    for (const key of Object.keys(process.env))
      if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    rmSync(home, { recursive: true, force: true });
  });
  const success = (response = 'hello', id = 'session-new') => ({
    event: 'result',
    result: {
      status: 'SUCCESS',
      response,
      conversation_id: id,
      usage: { input_tokens: 30, output_tokens: 4 },
    },
  });
  function agent(api = false, name = 'conversation-1') {
    return new AntigravityStrategy(api, {
      getConversationDataDir: () => join(home, name),
      getConversationId: () => name,
    });
  }
  function events(...values: unknown[]) {
    process.env.AGY_EVENTS = JSON.stringify(values);
  }
  function connection(onUrl?: () => void) {
    const received: string[] = [];
    const conn: AuthConnection = {
      sendAuthUrlGenerated: () => {
        received.push('url');
        onUrl?.();
      },
      sendDeviceCode: () => undefined,
      sendAuthManualToken: () => received.push('manual'),
      sendAuthSuccess: () => received.push('success'),
      sendAuthStatus: (status) => received.push(status),
      sendError: (message) => received.push(message),
    };
    return { received, conn };
  }

  test('owns protocol, model, effort and conversation flags and safely binds prompts', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({
      model: 'bad',
      effort: 'ultra',
      conversation: 'bad',
      'output-format': 'text',
      'input-format': 'stream-json',
      'print-timeout': '1s',
    });
    const args = buildAntigravityArgs(
      '-dash',
      'session-123',
      'gemini-3.8-flash-high',
      'max',
    );
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
    expect(args).not.toContain('--input-format');
    expect(args[args.indexOf('--model') + 1]).toBe('gemini-3.8-flash-high');
    expect(args[args.indexOf('--effort') + 1]).toBe('high');
    expect(args[args.indexOf('--conversation') + 1]).toBe('session-123');
    expect(args).toContain('--prompt=-dash');
    expect(args).toContain('--dangerously-skip-permissions');
  });

  test('keeps configured model and effort arguments when Chat has no override', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({
      model: 'configured-model',
      effort: 'medium',
    });
    const args = buildAntigravityArgs('hello', null);
    expect(args[args.indexOf('--model') + 1]).toBe('configured-model');
    expect(args[args.indexOf('--effort') + 1]).toBe('medium');
  });

  test('streams AGY deltas before exit, forwards tool and usage events, and avoids duplicate response', async () => {
    events(
      { event: 'init', conversation_id: 'session-new', init: {} },
      {
        event: 'step_update',
        step_update: {
          step_index: 3,
          state: 'ACTIVE',
          step_type: 'agent_response',
          text_delta: 'hel',
        },
      },
      {
        event: 'step_update',
        step_update: {
          step_index: 3,
          state: 'DONE',
          step_type: 'agent_response',
          text_delta: 'lo',
        },
      },
      {
        event: 'step_update',
        step_update: {
          step_index: 4,
          state: 'DONE',
          step_type: 'tool',
          tool_name: 'run_command',
          tool_info: {
            name: 'run_command',
            parameters: { CommandLine: 'echo hello' },
            output: 'hello',
          },
        },
      },
      success(),
    );
    const chunks: string[] = [],
      tools: ToolEvent[] = [],
      counts: unknown[] = [];
    let completed = false;
    await agent().executePromptStreaming(
      'hello',
      'gemini-3.8-flash-high',
      (text) => {
        expect(completed).toBe(false);
        chunks.push(text);
      },
      {
        onTool: (event) => tools.push(event),
        onUsage: (value) => counts.push(value),
      },
      undefined,
      { effort: 'low' },
    );
    completed = true;
    expect(chunks).toEqual(['hel', 'lo']);
    expect(tools[0].command).toBe('echo hello');
    expect(counts).toEqual([{ inputTokens: 30, outputTokens: 4 }]);
    expect(
      readFileSync(
        join(home, 'conversation-1', '.antigravity_session'),
        'utf8',
      ),
    ).toBe('session-new');
  });

  test('resumes the scoped session with current-turn response and isolates other conversations', async () => {
    events(success('repeat'));
    const runtime = agent();
    await runtime.executePromptStreaming('first', '', () => undefined);
    events(success('repeat this is new'));
    const chunks: string[] = [];
    await runtime.executePromptStreaming('second', '', (text) =>
      chunks.push(text),
    );
    const args: string[] = JSON.parse(
      readFileSync(join(home, 'args.json'), 'utf8'),
    );
    expect(args[args.indexOf('--conversation') + 1]).toBe('session-new');
    expect(chunks).toEqual(['repeat this is new']);
    events(success('different', 'session-other'));
    await agent(false, 'conversation-2').executePromptStreaming(
      'other',
      '',
      () => undefined,
    );
    expect(
      JSON.parse(readFileSync(join(home, 'args.json'), 'utf8')),
    ).not.toContain('--conversation');
  });

  for (const status of [
    'ERROR',
    'CANCELED',
    'INTERRUPTED',
    'INVALID',
    'WAITING',
    'RUNNING',
  ]) {
    test(`rejects ${status} despite zero exit without saving session`, async () => {
      events({
        event: 'result',
        result: {
          status,
          response: 'partial',
          error: 'provider did not finish',
        },
      });
      await expect(
        agent().executePromptStreaming('hello', '', () => undefined),
      ).rejects.toThrow('provider did not finish');
      expect(
        existsSync(join(home, 'conversation-1', '.antigravity_session')),
      ).toBe(false);
    });
  }
  test('rejects malformed stream or missing result even after text output', async () => {
    events({
      event: 'step_update',
      step_update: { step_type: 'agent_response', text_delta: 'partial' },
    });
    await expect(
      agent().executePromptStreaming('hello', '', () => undefined),
    ).rejects.toThrow('did not complete');
    events('not-json', success());
    await expect(
      agent().executePromptStreaming('hello', '', () => undefined),
    ).rejects.toThrow('did not complete');
  });
  test('clears missing session marker for a fresh retry', async () => {
    mkdirSync(join(home, 'conversation-1'), { recursive: true });
    const marker = join(home, 'conversation-1', '.antigravity_session');
    writeFileSync(marker, 'stale');
    events({
      event: 'result',
      result: { status: 'ERROR', error: 'conversation stale not found' },
    });
    await expect(
      agent().executePromptStreaming('continue', '', () => undefined),
    ).rejects.toThrow('conversation was not found');
    expect(existsSync(marker)).toBe(false);
  });
  test('rejects nonzero exits and empty success', async () => {
    events(success());
    process.env.AGY_EXIT = '1';
    await expect(
      agent().executePromptStreaming('hello', '', () => undefined),
    ).rejects.toThrow('did not complete');
    process.env.AGY_EXIT = '0';
    events(success(''));
    await expect(
      agent().executePromptStreaming('hello', '', () => undefined),
    ).rejects.toThrow('without a response');
  });
  test('configures Gemini API-key auth, preserves settings and passes saved key', async () => {
    const dir = join(home, '.gemini', 'antigravity-cli');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['command(git)'] } }),
    );
    const runtime = agent(true);
    const { conn, received } = connection();
    runtime.executeAuth(conn);
    expect(received).toEqual(['manual']);
    runtime.submitAuthCode('test-key');
    expect(received).toEqual(['manual', 'success']);
    expect(
      JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')),
    ).toEqual({
      permissions: { allow: ['command(git)'] },
      modelProvider: 'gemini',
    });
    await expect(runtime.checkAuthStatus()).resolves.toBe(true);
    events(success());
    await runtime.executePromptStreaming('hello', '', () => undefined);
    expect(readFileSync(join(home, 'key.txt'), 'utf8')).toBe('present');
    runtime.clearCredentials();
    await expect(runtime.checkAuthStatus()).resolves.toBe(false);
  });
  test('submits OAuth code through a real Node terminal and cancels without reporting success', () => {
    process.env.AGY_AUTH = '1';
    // Bun on macOS does not deliver node-pty data callbacks. Exercise the
    // complete strategy under Node, matching the deployed runtime.
    const script = `
      const fs = require('node:fs');
      const path = require('node:path');
      const Module = require('node:module');
      const ts = require('typescript');
      const resolveFilename = Module._resolveFilename;
      Module._resolveFilename = function(id, ...args) {
        if (id.startsWith('@shared/')) id = path.resolve('../../shared', id.slice(8)) + '.ts';
        return resolveFilename.call(this, id, ...args);
      };
      require.extensions['.ts'] = (module, filename) => module._compile(
        ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
        }).outputText, filename);
      const { AntigravityStrategy } = require('./src/app/strategies/antigravity.strategy.ts');
      const runtime = new AntigravityStrategy(false, {
        getConversationDataDir: () => path.join(process.env.HOME, 'auth-conversation')
      });
      const received = [];
      const deadline = setTimeout(() => { runtime.cancelAuth(); process.exit(1); }, 3000);
      const conn = {
        sendAuthUrlGenerated: () => { received.push('url'); runtime.submitAuthCode('test-code'); },
        sendDeviceCode: () => {}, sendAuthManualToken: () => {},
        sendError: (message) => { console.error(message); process.exit(2); },
        sendAuthStatus: () => process.exit(3),
        sendAuthSuccess: () => {
          received.push('success');
          runtime.executeAuth({ ...conn, sendAuthUrlGenerated: () => {
            received.push('cancel-url'); runtime.cancelAuth();
            clearTimeout(deadline);
            setTimeout(() => { console.log(JSON.stringify(received)); process.exit(0); }, 100);
          }, sendAuthSuccess: () => process.exit(4) });
        }
      };
      runtime.executeAuth(conn);
    `;
    const nodeEnv = { ...process.env, HOME: home };
    delete nodeEnv.FORCE_COLOR;
    const run = spawnSync('node', ['-e', script], {
      cwd: resolve(import.meta.dir, '../../..'),
      env: nodeEnv,
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout.trim())).toEqual([
      'url',
      'success',
      'cancel-url',
    ]);
  });
  test('discovers model slugs without display labels or duplicates', async () => {
    await expect(agent().listModels()).resolves.toEqual([
      'gemini-3.8-flash-high',
      'claude-sonnet-4-6',
    ]);
  });
  test('queues steering for the next turn', async () => {
    events(success());
    const runtime = agent();
    expect(runtime.steerAgent('operator update')).toBe('queued');
    await runtime.executePromptStreaming('continue', '', () => undefined);
    expect(readFileSync(join(home, 'args.json'), 'utf8')).toContain(
      'operator update',
    );
  });
  test('preserves injected legacy keyring authentication', async () => {
    const dir = join(home, '.gemini', '.local', 'share', 'keyrings');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'login.keyring'), Buffer.from([0, 1, 2]));
    await expect(agent().checkAuthStatus()).resolves.toBe(true);
  });
});
