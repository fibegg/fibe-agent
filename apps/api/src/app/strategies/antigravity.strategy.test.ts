import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AntigravityStrategy,
  buildAntigravityArgs,
  extractAntigravityLatestOutput,
  readAntigravityLastConversation,
} from './antigravity.strategy';

describe('AntigravityStrategy', () => {
  let testHome: string;
  let envBackup: Record<string, string | undefined>;

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), 'antigravity-strategy-test-'));
    envBackup = {
      ANTIGRAVITY_BIN: process.env.ANTIGRAVITY_BIN,
      ANTIGRAVITY_FAKE_MESSAGE: process.env.ANTIGRAVITY_FAKE_MESSAGE,
      ANTIGRAVITY_FAKE_MISSING: process.env.ANTIGRAVITY_FAKE_MISSING,
      ANTIGRAVITY_FAKE_SESSION_ID: process.env.ANTIGRAVITY_FAKE_SESSION_ID,
      ANTIGRAVITY_FAKE_STDERR: process.env.ANTIGRAVITY_FAKE_STDERR,
      ANTIGRAVITY_FAKE_WAIT_STDIN: process.env.ANTIGRAVITY_FAKE_WAIT_STDIN,
      ANTIGRAVITY_HOME: process.env.ANTIGRAVITY_HOME,
      PROVIDER_ARGS: process.env.PROVIDER_ARGS,
      SESSION_DIR: process.env.SESSION_DIR,
    };
    delete process.env.ANTIGRAVITY_FAKE_MESSAGE;
    delete process.env.ANTIGRAVITY_FAKE_MISSING;
    delete process.env.ANTIGRAVITY_FAKE_SESSION_ID;
    delete process.env.ANTIGRAVITY_FAKE_STDERR;
    delete process.env.ANTIGRAVITY_FAKE_WAIT_STDIN;
    delete process.env.ANTIGRAVITY_HOME;
    delete process.env.PROVIDER_ARGS;
    process.env.SESSION_DIR = join(testHome, '.gemini');
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(testHome, { recursive: true, force: true });
  });

  function makeConversationProvider() {
    return {
      getConversationDataDir: () => join(testHome, 'conversation-1'),
      getDefaultConversationDataDir: () => join(testHome, 'default-conversation'),
      getConversationId: () => 'conversation-1',
    };
  }

  function writeFakeAgy(argsPath: string, envPath?: string): string {
    const fakePath = join(testHome, 'fake-agy');
    writeFileSync(fakePath, `#!/bin/sh
printf '%s\\n' "$@" > "${argsPath}"
${envPath ? `printf '%s' "$HOME" > "${envPath}"` : ''}
if [ "$ANTIGRAVITY_FAKE_MISSING" = "1" ]; then
  echo 'Warning: conversation "stale-session" not found.'
  echo 'fresh answer'
  exit 0
fi
if [ "$ANTIGRAVITY_FAKE_WAIT_STDIN" = "1" ]; then
  cat >/dev/null
fi
session_id="\${ANTIGRAVITY_FAKE_SESSION_ID:-session-new}"
mkdir -p "$HOME/.gemini/antigravity-cli/cache"
escaped_pwd=$(printf '%s' "$PWD" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
printf '{"%s":"%s"}\\n' "$escaped_pwd" "$session_id" > "$HOME/.gemini/antigravity-cli/cache/last_conversations.json"
if [ -n "$ANTIGRAVITY_FAKE_STDERR" ]; then
  printf '%s' "$ANTIGRAVITY_FAKE_STDERR" >&2
fi
printf '%s' "\${ANTIGRAVITY_FAKE_MESSAGE:-antigravity response}"
`);
    chmodSync(fakePath, 0o755);
    process.env.ANTIGRAVITY_BIN = fakePath;
    return fakePath;
  }

  test('buildAntigravityArgs enforces headless flags and owns conversation state', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({
      '--conversation': 'user-session',
      '--print': true,
      '--prompt': 'bad',
      '--print-timeout': '1s',
      'add-dir': '/tmp/extra',
    });

    const args = buildAntigravityArgs('-starts with a dash', 'session-123');

    expect(args).not.toContain('--print');
    expect(args).not.toContain('--prompt');
    expect(args).toContain('--sandbox');
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--add-dir');
    expect(args).toContain('/tmp/extra');
    expect(args).toContain('--print-timeout');
    expect(args).toContain('1s');
    expect(args.slice(args.indexOf('--conversation'))).toEqual([
      '--conversation',
      'session-123',
      '--prompt=-starts with a dash',
    ]);
  });

  test('reads Antigravity last conversation cache by workspace path', () => {
    const workspaceDir = join(testHome, 'workspace');
    const geminiDir = join(testHome, '.gemini');
    mkdirSync(join(geminiDir, 'antigravity-cli', 'cache'), { recursive: true });
    writeFileSync(
      join(geminiDir, 'antigravity-cli', 'cache', 'last_conversations.json'),
      JSON.stringify({ [workspaceDir]: 'session-cached' })
    );

    expect(readAntigravityLastConversation(geminiDir, workspaceDir)).toBe('session-cached');
  });

  test('extractAntigravityLatestOutput strips cumulative provider stdout', () => {
    expect(extractAntigravityLatestOutput('first\nsecond', 'first')).toBe('second');
    expect(extractAntigravityLatestOutput('first\nsecond\nthird', null, ['first', 'second'])).toBe('second\nthird');
    expect(extractAntigravityLatestOutput('first\nsecond\nthird', null, ['first\nsecond'])).toBe('third');
    expect(extractAntigravityLatestOutput('fresh', 'previous')).toBe('fresh');
  });

  test('extractAntigravityLatestOutput removes internal prompt-context mode blocks', () => {
    expect(extractAntigravityLatestOutput('[MODE]Dialog[/MODE]\nvisible', null)).toBe('visible');
    expect(
      extractAntigravityLatestOutput(
        '[MODE]Dialog[/MODE]\nfirst\n[MODE]Dialog[/MODE]\nsecond',
        null,
        ['first'],
      ),
    ).toBe('second');
  });

  test('treats an injected Secret Service keyring as authenticated state', async () => {
    const geminiDir = join(testHome, '.gemini');
    mkdirSync(join(geminiDir, '.local', 'share', 'keyrings'), { recursive: true });
    writeFileSync(join(geminiDir, '.local', 'share', 'keyrings', 'login.keyring'), Buffer.from([0, 1, 2, 3]));
    const strategy = new AntigravityStrategy(false, makeConversationProvider());

    await expect(strategy.checkAuthStatus()).resolves.toBe(true);
  });

  test('runs agy headlessly and persists the captured conversation id', async () => {
    const argsPath = join(testHome, 'args.txt');
    const envPath = join(testHome, 'home.txt');
    writeFakeAgy(argsPath, envPath);
    const strategy = new AntigravityStrategy(false, makeConversationProvider());
    const chunks: string[] = [];

    await strategy.executePromptStreaming('hello', '', (chunk) => chunks.push(chunk));

    const stateDir = join(testHome, 'conversation-1');
    expect(chunks).toEqual(['antigravity response']);
    expect(readFileSync(join(stateDir, '.antigravity_session'), 'utf8')).toBe('session-new');
    expect(readFileSync(envPath, 'utf8')).toBe(testHome);
    expect(readFileSync(argsPath, 'utf8')).toContain('--prompt=hello');
  });

  test('does not keep stdin open for headless prompt execution', async () => {
    const argsPath = join(testHome, 'stdin-args.txt');
    writeFakeAgy(argsPath);
    process.env.ANTIGRAVITY_FAKE_WAIT_STDIN = '1';
    const strategy = new AntigravityStrategy(false, makeConversationProvider());
    const chunks: string[] = [];
    const execution = strategy.executePromptStreaming('hello', '', (chunk) => chunks.push(chunk));
    const result = await Promise.race([
      execution.then(() => 'completed' as const),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 1000)),
    ]);

    if (result === 'timeout') {
      strategy.interruptAgent();
      await expect(execution).rejects.toThrow();
      throw new Error('Timed out waiting for Antigravity stdin to close');
    }

    expect(chunks).toEqual(['antigravity response']);
  });

  test('emits only the latest response when Antigravity returns cumulative stdout', async () => {
    const argsPath = join(testHome, 'cumulative-args.txt');
    writeFakeAgy(argsPath);
    const strategy = new AntigravityStrategy(false, makeConversationProvider());
    const firstChunks: string[] = [];
    process.env.ANTIGRAVITY_FAKE_MESSAGE = 'first response';

    await strategy.executePromptStreaming('first', '', (chunk) => firstChunks.push(chunk));
    expect(firstChunks).toEqual(['first response']);

    const secondChunks: string[] = [];
    process.env.ANTIGRAVITY_FAKE_MESSAGE = 'first response\nsecond response';
    await strategy.executePromptStreaming('second', '', (chunk) => secondChunks.push(chunk));

    expect(secondChunks).toEqual(['second response']);
    expect(readFileSync(join(testHome, 'conversation-1', '.antigravity_stdout'), 'utf8')).toBe(
      'first response\nsecond response',
    );
  });

  test('uses prior assistant messages to recover from a missing stdout cursor', async () => {
    const argsPath = join(testHome, 'fallback-cumulative-args.txt');
    writeFakeAgy(argsPath);
    const stateDir = join(testHome, 'conversation-1');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, '.antigravity_session'), 'session-existing');
    process.env.ANTIGRAVITY_FAKE_MESSAGE = 'first response\nsecond response';
    const strategy = new AntigravityStrategy(false, makeConversationProvider());
    const chunks: string[] = [];

    await strategy.executePromptStreaming(
      'second',
      '',
      (chunk) => chunks.push(chunk),
      undefined,
      undefined,
      { previousAssistantMessages: ['first response'] },
    );

    expect(chunks).toEqual(['second response']);
  });

  test('streams stderr as best-effort reasoning diagnostics', async () => {
    const argsPath = join(testHome, 'stderr-args.txt');
    writeFakeAgy(argsPath);
    process.env.ANTIGRAVITY_FAKE_STDERR = 'diagnostic line\n';
    const strategy = new AntigravityStrategy(false, makeConversationProvider());
    const events: string[] = [];

    await strategy.executePromptStreaming(
      'hello',
      '',
      () => undefined,
      {
        onReasoningStart: () => events.push('start'),
        onReasoningChunk: (chunk) => events.push(chunk),
        onReasoningEnd: () => events.push('end'),
      },
    );

    expect(events).toEqual(['start', 'diagnostic line\n', 'end']);
  });

  test('resumes a stored Antigravity conversation id', async () => {
    const argsPath = join(testHome, 'resume-args.txt');
    writeFakeAgy(argsPath);
    const stateDir = join(testHome, 'conversation-1');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, '.antigravity_session'), 'session-existing');
    const strategy = new AntigravityStrategy(false, makeConversationProvider());

    await strategy.executePromptStreaming('continue', '', () => undefined);

    const args = readFileSync(argsPath, 'utf8').trim().split(/\r?\n/);
    expect(args).toContain('--conversation');
    expect(args[args.indexOf('--conversation') + 1]).toBe('session-existing');
  });

  test('queues steering for the next Antigravity turn instead of interrupting print mode', async () => {
    const argsPath = join(testHome, 'steer-args.txt');
    writeFakeAgy(argsPath);
    const strategy = new AntigravityStrategy(false, makeConversationProvider());

    expect(strategy.steerAgent('operator update')).toBe('queued');
    await strategy.executePromptStreaming('continue', '', () => undefined);

    expect(readFileSync(argsPath, 'utf8')).toContain('[Operator Interruption]');
    expect(readFileSync(argsPath, 'utf8')).toContain('operator update');
  });

  test('clears stale session marker when Antigravity starts fresh after a missing conversation', async () => {
    const argsPath = join(testHome, 'missing-args.txt');
    writeFakeAgy(argsPath);
    process.env.ANTIGRAVITY_FAKE_MISSING = '1';
    const stateDir = join(testHome, 'conversation-1');
    mkdirSync(stateDir, { recursive: true });
    const markerPath = join(stateDir, '.antigravity_session');
    writeFileSync(markerPath, 'stale-session');
    const strategy = new AntigravityStrategy(false, makeConversationProvider());

    await expect(strategy.executePromptStreaming('continue', '', () => undefined)).rejects.toThrow(
      /Stored Antigravity conversation was not found/
    );
    expect(existsSync(markerPath)).toBe(false);
  });
});
