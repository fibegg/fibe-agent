import { describe, it, expect } from 'vitest';
import { getThinkingLines, getThinkingLineKeys } from './thinking-copy';

describe('waiting copy', () => {
  it.each([
    null,
    '',
    'What is 42?',
    'I need coffee',
    'easter egg',
    'hello',
    'think hard',
    'abracadabra',
  ])('keeps ordinary thinking status for %s', (message) => {
    expect(getThinkingLines(message)).toEqual(['Thinking...']);
    expect(getThinkingLineKeys(message)).toEqual(['chat.state.thinking']);
  });
});
