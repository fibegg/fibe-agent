import { describe, it, expect } from 'vitest';
import { getThinkingLines } from './thinking-copy';

describe('getThinkingLines', () => {
  it('returns default lines when lastUserMessage is null', () => {
    const lines = getThinkingLines(null);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('...');
  });

  it('returns default lines when lastUserMessage is empty string', () => {
    const lines = getThinkingLines('   ');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('returns phoenix easter egg lines when message contains phoenix', () => {
    const lines = getThinkingLines('Tell me about the phoenix');
    expect(lines).toContain('The phoenix is rising from the ashes...');
  });

  it('returns 42 easter egg lines when message contains 42', () => {
    const lines = getThinkingLines('What is 42?');
    expect(lines).toContain('Computing the ultimate answer...');
  });

  it('returns coffee easter egg lines when message contains coffee', () => {
    const lines = getThinkingLines('I need coffee');
    expect(lines).toContain('Taking a sip of inspiration...');
  });

  it('returns secret easter egg lines when message contains easter egg', () => {
    const lines = getThinkingLines('easter egg found');
    expect(lines).toContain('You found the secret...');
  });
});
