/**
 * Thin wrapper around @chenglou/pretext for chat virtualizer height estimation.
 *
 * All three public functions are pure arithmetic (zero DOM reads, zero reflows).
 * Canvas handles are memoised in an LRU cache keyed by (text, fontSpec).
 *
 * SSR: every function returns a safe fallback when `window` is absent.
 */

import { layout, prepare } from '@chenglou/pretext';

// ─── Design constants — must match the CSS applied to message bubbles ─────────

/** Font spec matching the chat body text (Inter / system-ui at 14 px). */
const BODY_FONT = '14px "Inter", "system-ui", sans-serif';

/** Line-height in px — Tailwind `leading-relaxed` at `text-sm`. */
const LINE_HEIGHT = 22;

/** Vertical space consumed by a bubble beyond its text content (padding + meta row). */
const BUBBLE_PADDING = 44;

/** Flat height bonus for messages that contain a code block (``` heuristic). */
const CODE_BLOCK_BONUS = 80;

/** Minimum height for any bubble (empty / placeholder). */
const MIN_HEIGHT = 52;

/** Extra height reserved on the streaming bubble to absorb incremental growth. */
const STREAMING_SLACK = 32;

/** Minimum pixel width for a user bubble (must fit the metadata row ≈ 110 px). */
const MIN_BUBBLE_WIDTH = 130;

/** Left+right horizontal padding inside a bubble (`sm:px-4` = 16 × 2 = 32 px). */
const BUBBLE_H_PAD = 32;

// ─── LRU handle cache ─────────────────────────────────────────────────────────

/** Maximum number of prepared handles held in memory. */
const MAX_CACHE = 500;

type Handle = ReturnType<typeof prepare>;

const cache = new Map<string, Handle>();

function getHandle(text: string, font: string): Handle {
  const key = `${text}|||${font}`;
  const hit = cache.get(key);
  if (hit) {
    // Refresh to MRU position
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  if (cache.size >= MAX_CACHE) {
    // Evict the oldest entry (first key in insertion order)
    const lru = cache.keys().next().value;
    if (lru !== undefined) cache.delete(lru);
  }
  const handle = prepare(text, font);
  cache.set(key, handle);
  return handle;
}

// ─── Shared guard ─────────────────────────────────────────────────────────────

function canRun(containerWidth: number): boolean {
  return typeof window !== 'undefined' && containerWidth > 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EstimateOptions {
  /** When true, adds CODE_BLOCK_BONUS to the estimate (``` heuristic). */
  hasCode?: boolean;
  /** Override font spec. Useful for tests. */
  fontSpec?: string;
  /** Override line height in px. */
  lineHeightPx?: number;
}

/**
 * Estimated pixel height for a finished chat message row.
 * Passed as `estimateSize` to `@tanstack/react-virtual`.
 */
export function estimateMessageHeight(
  text: string,
  containerWidth: number,
  opts: EstimateOptions = {}
): number {
  if (!canRun(containerWidth) || !text.trim()) return MIN_HEIGHT;
  try {
    const { height } = layout(
      getHandle(text, opts.fontSpec ?? BODY_FONT),
      containerWidth,
      opts.lineHeightPx ?? LINE_HEIGHT
    );
    return Math.max(MIN_HEIGHT, height + BUBBLE_PADDING + (opts.hasCode ? CODE_BLOCK_BONUS : 0));
  } catch {
    return MIN_HEIGHT;
  }
}

/**
 * Estimated pixel height for the in-progress streaming bubble.
 * Includes STREAMING_SLACK to absorb incremental token growth without jitter.
 */
export function estimateStreamingHeight(text: string, containerWidth: number): number {
  if (!canRun(containerWidth) || !text.trim()) return MIN_HEIGHT;
  try {
    const { height } = layout(getHandle(text, BODY_FONT), containerWidth, LINE_HEIGHT);
    return Math.max(MIN_HEIGHT, height + BUBBLE_PADDING + STREAMING_SLACK);
  } catch {
    return MIN_HEIGHT;
  }
}

/**
 * Binary-searches for the minimum bubble pixel width that preserves the same
 * line count as `maxWidth`. Enables iMessage-style tight bubbles — short
 * messages no longer stretch to the CSS `max-w-[80%]` cap.
 *
 * Complexity: O(log maxWidth) iterations of pure arithmetic (zero DOM reads).
 *
 * @returns Tight width clamped to [MIN_BUBBLE_WIDTH, maxWidth].
 */
export function computeTightBubbleWidth(
  text: string,
  maxWidth: number,
  opts: Pick<EstimateOptions, 'fontSpec' | 'lineHeightPx'> = {}
): number {
  if (!canRun(maxWidth) || !text.trim()) return maxWidth;

  const font = opts.fontSpec ?? BODY_FONT;
  const lh = opts.lineHeightPx ?? LINE_HEIGHT;
  const contentMax = Math.max(1, maxWidth - BUBBLE_H_PAD);

  try {
    const handle = getHandle(text, font);
    const { lineCount: target } = layout(handle, contentMax, lh);

    let lo = Math.max(1, MIN_BUBBLE_WIDTH - BUBBLE_H_PAD);
    let hi = contentMax;

    while (hi - lo > 2) {
      const mid = (lo + hi) >> 1;
      layout(handle, mid, lh).lineCount <= target ? (hi = mid) : (lo = mid + 1);
    }

    return Math.min(maxWidth, Math.max(MIN_BUBBLE_WIDTH, hi + BUBBLE_H_PAD));
  } catch {
    return maxWidth;
  }
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Clears the handle cache — exposed for tests only. */
export function clearPretextCache(): void {
  cache.clear();
}

/** Returns current handle cache size — exposed for tests only. */
export function getPretextCacheSize(): number {
  return cache.size;
}
