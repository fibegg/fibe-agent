import { describe, test, expect, beforeEach } from 'bun:test';
import { MockStrategy } from './mock.strategy';
import { INTERRUPTED_MESSAGE } from './strategy.types';

describe('MockStrategy', () => {
  let strategy: MockStrategy;

  beforeEach(() => {
    strategy = new MockStrategy();
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
});
