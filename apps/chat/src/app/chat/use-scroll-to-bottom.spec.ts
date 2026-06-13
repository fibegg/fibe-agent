import { describe, it, expect } from 'vitest';
import {
  SCROLL_AT_BOTTOM_THRESHOLD_PX,
  isScrollAtBottom,
  nextNewMessageCount,
} from './use-scroll-to-bottom';

describe('isScrollAtBottom', () => {
  it('returns true when scroll is at bottom (distance zero)', () => {
    expect(
      isScrollAtBottom(1000, 400, 600, 80)
    ).toBe(true);
  });

  it('returns true when within threshold', () => {
    expect(isScrollAtBottom(1000, 320, 600, 80)).toBe(true);
  });

  it('returns false when above threshold', () => {
    expect(isScrollAtBottom(1000, 300, 600, 80)).toBe(false);
  });

  it('uses default threshold when not provided', () => {
    expect(
      isScrollAtBottom(1000, 0, 1000)
    ).toBe(true);
    expect(
      isScrollAtBottom(1000, 0, 1000 - SCROLL_AT_BOTTOM_THRESHOLD_PX - 1)
    ).toBe(false);
  });

  it('returns true when content fits (no scroll)', () => {
    expect(isScrollAtBottom(500, 0, 500, 80)).toBe(true);
  });
});

describe('nextNewMessageCount', () => {
  it('does not increment when streaming text changes without a new visible item', () => {
    expect(nextNewMessageCount(0, 3, 3)).toBe(0);
  });

  it('increments by the visible item delta', () => {
    expect(nextNewMessageCount(2, 3, 5)).toBe(4);
  });

  it('does not decrement when the visible item count is reset lower', () => {
    expect(nextNewMessageCount(7, 5, 1)).toBe(7);
  });

  it('marks one current item update without accumulating every update', () => {
    expect(nextNewMessageCount(0, 3, 3, true)).toBe(1);
    expect(nextNewMessageCount(1, 3, 3, true)).toBe(1);
  });
});

// Hook integration tests for useScrollToBottom live in the React component
// tests (e.g. message-list.spec.tsx) where the full jsdom environment is
// already initialised within the shared worker. Running renderHook in a
// dedicated forks worker crashes due to the heavy jsdom + React 19 setup cost.
// The behaviour of isScrollAtBottom (the core scroll logic) is fully covered
// by the pure-function tests above.
