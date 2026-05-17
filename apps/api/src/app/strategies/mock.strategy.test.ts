import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { MockStrategy } from './mock.strategy';
import { INTERRUPTED_MESSAGE } from './strategy.types';

describe('MockStrategy', () => {
  let strategy: MockStrategy;
  const envBackup = process.env.MOCK_ECHO_PROMPT;
  const providerArgsBackup = process.env.PROVIDER_ARGS;

  beforeEach(() => {
    strategy = new MockStrategy();
  });

  afterEach(() => {
    if (envBackup === undefined) {
      delete process.env.MOCK_ECHO_PROMPT;
    } else {
      process.env.MOCK_ECHO_PROMPT = envBackup;
    }
    if (providerArgsBackup === undefined) {
      delete process.env.PROVIDER_ARGS;
    } else {
      process.env.PROVIDER_ARGS = providerArgsBackup;
    }
  });

  test('interruptAgent rejects executePromptStreaming promise with INTERRUPTED', async () => {
    const chunks: string[] = [];
    const promise = strategy.executePromptStreaming(
      'prompt',
      'model',
      (chunk) => chunks.push(chunk),
      undefined,
      undefined
    );
    strategy.interruptAgent();
    await expect(promise).rejects.toThrow(INTERRUPTED_MESSAGE);
  });

  test('interruptAgent when no stream is running does not throw', () => {
    expect(() => strategy.interruptAgent()).not.toThrow();
  });

  test('can echo prompt inputs for e2e prompt-boundary verification', async () => {
    process.env.MOCK_ECHO_PROMPT = 'true';
    process.env.PROVIDER_ARGS = JSON.stringify({
      'max-tokens': 4096,
      temperature: 0.2,
      'dry-run': false,
      label: 'value with spaces',
      c: 'never',
      p: 'blocked prompt',
      yolo: true,
      prompt: 'blocked prompt',
    });
    const chunks: string[] = [];

    await strategy.executePromptStreaming(
      'user prompt',
      'model',
      (chunk) => chunks.push(chunk),
      undefined,
      'system prompt'
    );

    const output = chunks.join('');
    const tokenJson = output.match(/PROVIDER_CLI_TOKENS_JSON:\n([^\n]+)/)?.[1];

    expect(output).toContain('SYSTEM_PROMPT:\nsystem prompt');
    expect(output).toContain('"max-tokens":4096');
    expect(tokenJson).toBeDefined();
    expect(JSON.parse(tokenJson as string)).toEqual([
      '--max-tokens',
      '4096',
      '--temperature',
      '0.2',
      '--dry-run',
      'false',
      '--label',
      'value with spaces',
      '-c',
      'never',
    ]);
    expect(tokenJson).not.toContain('blocked prompt');
    expect(output).toContain('PROMPT:\nuser prompt');
  });
});
