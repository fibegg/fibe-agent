import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  clearPretextCache,
  computeTightBubbleWidth,
  estimateMessageHeight,
  estimateStreamingHeight,
  getPretextCacheSize,
} from './pretext-height';

/** Mocks Canvas-free layout as an 8 px monospace font with 22 px lines. */
vi.mock('@chenglou/pretext', () => ({
  prepare: vi.fn((text: string) => ({ text })),
  layout: vi.fn(
    (handle: { text: string }, containerWidth: number, lineHeight: number) => {
      const CHAR_W = 8;
      const charsPerLine = Math.max(1, Math.floor(containerWidth / CHAR_W));
      const lineCount = Math.max(
        1,
        Math.ceil(handle.text.length / charsPerLine),
      );
      return { height: lineCount * lineHeight, lineCount };
    },
  ),
}));

const MIN_HEIGHT = 52;
const BUBBLE_PADDING = 44;
const CODE_BLOCK_BONUS = 80;
const STREAMING_SLACK = 32;
const MIN_BUBBLE_WIDTH = 130;
const BUBBLE_H_PAD = 32;

const CHAR_W = 8;
const LINE_H = 22;
function mockLineCount(chars: number, width: number) {
  return Math.max(
    1,
    Math.ceil(chars / Math.max(1, Math.floor(width / CHAR_W))),
  );
}

const W = 640; // container width used in most tests

describe('pretext-height', () => {
  beforeEach(() => clearPretextCache());
  afterEach(() => vi.clearAllMocks());

  describe('estimateMessageHeight', () => {
    it('returns MIN_HEIGHT for empty string', () => {
      expect(estimateMessageHeight('', W)).toBe(MIN_HEIGHT);
    });

    it('returns MIN_HEIGHT for whitespace-only string', () => {
      expect(estimateMessageHeight('   ', W)).toBe(MIN_HEIGHT);
    });

    it('returns MIN_HEIGHT when containerWidth is 0', () => {
      expect(estimateMessageHeight('hello', 0)).toBe(MIN_HEIGHT);
    });

    it('returns MIN_HEIGHT when containerWidth is negative', () => {
      expect(estimateMessageHeight('hello', -1)).toBe(MIN_HEIGHT);
    });

    it('single-line text → 1 line height + BUBBLE_PADDING', () => {
      const h = estimateMessageHeight('Hello world', W);
      expect(h).toBe(Math.max(MIN_HEIGHT, LINE_H + BUBBLE_PADDING));
    });

    it('multi-line text produces larger height than single-line', () => {
      const single = estimateMessageHeight('Hi', W);
      const multi = estimateMessageHeight('A'.repeat(200), W);
      expect(multi).toBeGreaterThan(single);
    });

    it('adds CODE_BLOCK_BONUS when hasCode is true', () => {
      const base = estimateMessageHeight('hello', W);
      const withCode = estimateMessageHeight('hello', W, { hasCode: true });
      expect(withCode - base).toBe(CODE_BLOCK_BONUS);
    });

    it('does not add CODE_BLOCK_BONUS when hasCode is false', () => {
      const base = estimateMessageHeight('hello', W);
      expect(estimateMessageHeight('hello', W, { hasCode: false })).toBe(base);
    });

    it('custom lineHeightPx scales wrapped text height', () => {
      const text = 'A'.repeat(200);
      const h22 = estimateMessageHeight(text, W);
      const h30 = estimateMessageHeight(text, W, { lineHeightPx: 30 });
      expect(h30).toBeGreaterThan(h22);
    });

    it('returns the same value on repeated calls (cache hit)', () => {
      expect(estimateMessageHeight('x', W)).toBe(estimateMessageHeight('x', W));
    });

    it('cache size grows after first call', () => {
      clearPretextCache();
      estimateMessageHeight('fresh', W);
      expect(getPretextCacheSize()).toBeGreaterThan(0);
    });
  });

  describe('estimateStreamingHeight', () => {
    it('returns MIN_HEIGHT for empty string', () => {
      expect(estimateStreamingHeight('', W)).toBe(MIN_HEIGHT);
    });

    it('returns MIN_HEIGHT when containerWidth is 0', () => {
      expect(estimateStreamingHeight('hello', 0)).toBe(MIN_HEIGHT);
    });

    it('is exactly STREAMING_SLACK taller than estimateMessageHeight', () => {
      const text = 'Hello streaming text';
      expect(estimateStreamingHeight(text, W)).toBe(
        estimateMessageHeight(text, W) + STREAMING_SLACK,
      );
    });

    it('grows with longer text', () => {
      expect(estimateStreamingHeight('A'.repeat(200), W)).toBeGreaterThan(
        estimateStreamingHeight('Hi', W),
      );
    });
  });

  describe('clearPretextCache', () => {
    it('resets cache to zero', () => {
      estimateMessageHeight('fill', W);
      clearPretextCache();
      expect(getPretextCacheSize()).toBe(0);
    });

    it('is idempotent (safe to call multiple times)', () => {
      expect(() => {
        clearPretextCache();
        clearPretextCache();
      }).not.toThrow();
    });
  });

  describe('getPretextCacheSize', () => {
    it('returns 0 on a fresh cache', () => {
      clearPretextCache();
      expect(getPretextCacheSize()).toBe(0);
    });

    it('counts unique (text, font) pairs only', () => {
      clearPretextCache();
      estimateMessageHeight('alpha', W);
      estimateMessageHeight('beta', W);
      estimateMessageHeight('alpha', W); // cache hit: no growth
      expect(getPretextCacheSize()).toBe(2);
    });

    it('evicts oldest entry when MAX_CACHE (500) is reached', () => {
      clearPretextCache();
      // Fill the cache to exactly 500 unique entries
      for (let i = 0; i < 500; i++) estimateMessageHeight(`msg-${i}`, W);
      expect(getPretextCacheSize()).toBe(500);

      estimateMessageHeight('msg-overflow', W);
      expect(getPretextCacheSize()).toBe(500);
    });
  });

  const MAX_W = W * 0.8; // 512

  describe('computeTightBubbleWidth', () => {
    it('returns maxWidth unchanged for empty text', () => {
      expect(computeTightBubbleWidth('', MAX_W)).toBe(MAX_W);
    });

    it('returns maxWidth unchanged for whitespace-only text', () => {
      expect(computeTightBubbleWidth('   ', MAX_W)).toBe(MAX_W);
    });

    it('returns maxWidth unchanged when maxWidth is 0', () => {
      expect(computeTightBubbleWidth('hello', 0)).toBe(0);
    });

    it('returns maxWidth unchanged when maxWidth is negative', () => {
      expect(computeTightBubbleWidth('hello', -100)).toBe(-100);
    });

    it('result is always ≤ maxWidth', () => {
      expect(computeTightBubbleWidth('Hello world', MAX_W)).toBeLessThanOrEqual(
        MAX_W,
      );
    });

    it('result is always ≥ MIN_BUBBLE_WIDTH for non-empty text', () => {
      expect(computeTightBubbleWidth('Hi', MAX_W)).toBeGreaterThanOrEqual(
        MIN_BUBBLE_WIDTH,
      );
    });

    it('short text produces a tighter result than long text', () => {
      const short = computeTightBubbleWidth('Hello world', MAX_W);
      const long = computeTightBubbleWidth('A'.repeat(200), MAX_W);
      expect(short).toBeLessThan(long);
    });

    it('single-line text produces result < maxWidth', () => {
      expect(computeTightBubbleWidth('Hello world', MAX_W)).toBeLessThan(MAX_W);
    });

    it('text that fully fills maxWidth returns approximately maxWidth', () => {
      const fullLineText = 'A'.repeat(60);
      const result = computeTightBubbleWidth(fullLineText, MAX_W);
      expect(result).toBe(MAX_W);
    });

    it('tight width preserves line count for single-line text', () => {
      const text = 'Hello world';
      const tight = computeTightBubbleWidth(text, MAX_W);
      const contentAtTight = tight - BUBBLE_H_PAD;
      expect(mockLineCount(text.length, contentAtTight)).toBe(1);
    });

    it('tight width preserves line count for multi-line text', () => {
      const text = 'A'.repeat(200);
      const targetLines = mockLineCount(text.length, MAX_W - BUBBLE_H_PAD);
      const tight = computeTightBubbleWidth(text, MAX_W);
      const contentAtTight = tight - BUBBLE_H_PAD;
      expect(mockLineCount(text.length, contentAtTight)).toBeLessThanOrEqual(
        targetLines,
      );
    });

    it('accepts custom fontSpec without throwing', () => {
      expect(() =>
        computeTightBubbleWidth('Hello', MAX_W, { fontSpec: '16px monospace' }),
      ).not.toThrow();
    });

    it('accepts custom lineHeightPx without throwing', () => {
      expect(() =>
        computeTightBubbleWidth('Hello', MAX_W, { lineHeightPx: 30 }),
      ).not.toThrow();
    });
  });
});
