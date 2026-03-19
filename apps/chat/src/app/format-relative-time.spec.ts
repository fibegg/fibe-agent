import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './format-relative-time';

describe('formatRelativeTime', () => {
  it('returns just now for timestamps within 5 seconds', () => {
    const now = 1000000000000;
    expect(formatRelativeTime(new Date(now - 2000), now)).toBe('just now');
    expect(formatRelativeTime(new Date(now - 4000), now)).toBe('just now');
  });

  it('returns Xs ago for under 60 seconds', () => {
    const now = 1000000000000;
    expect(formatRelativeTime(new Date(now - 10000), now)).toBe('10s ago');
    expect(formatRelativeTime(new Date(now - 59000), now)).toBe('59s ago');
  });

  it('returns Xm ago for under 60 minutes', () => {
    const now = 1000000000000;
    expect(formatRelativeTime(new Date(now - 60 * 1000), now)).toBe('1m ago');
    expect(formatRelativeTime(new Date(now - 35 * 60 * 1000), now)).toBe('35m ago');
  });

  it('returns Xh ago for under 24 hours', () => {
    const now = 1000000000000;
    expect(formatRelativeTime(new Date(now - 60 * 60 * 1000), now)).toBe('1h ago');
    expect(formatRelativeTime(new Date(now - 12 * 60 * 60 * 1000), now)).toBe('12h ago');
  });

  it('returns short date for 24 hours or more', () => {
    const now = 1000000000000;
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(twoDaysAgo, now);
    expect(result).toMatch(/^[A-Za-z]{3}\s+\d+$/);
  });

  it('accepts ISO string timestamp', () => {
    const now = 1000000000000;
    expect(formatRelativeTime(new Date(now - 15000).toISOString(), now)).toBe('15s ago');
  });
});
