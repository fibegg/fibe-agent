/** Pure, SSR-safe chat height estimates backed by cached Pretext handles. */

import { layout, prepare } from '@chenglou/pretext';

const BODY_FONT = '14px "Plus Jakarta Sans", "system-ui", sans-serif';

const LINE_HEIGHT = 22;

const BUBBLE_PADDING = 44;

const CODE_BLOCK_BONUS = 80;

const MIN_HEIGHT = 52;

const STREAMING_SLACK = 32;

const MIN_BUBBLE_WIDTH = 130;

const BUBBLE_H_PAD = 32;

const MAX_CACHE = 500;

type Handle = ReturnType<typeof prepare>;

const cache = new Map<string, Handle>();

function getHandle(text: string, font: string): Handle {
  const key = `${text}|||${font}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  if (cache.size >= MAX_CACHE) {
    const lru = cache.keys().next().value;
    if (lru !== undefined) cache.delete(lru);
  }
  const handle = prepare(text, font);
  cache.set(key, handle);
  return handle;
}

function canRun(containerWidth: number): boolean {
  return typeof window !== 'undefined' && containerWidth > 0;
}

export interface EstimateOptions {
  /** When true, adds CODE_BLOCK_BONUS to the estimate (``` heuristic). */
  hasCode?: boolean;
  /** Override font spec. Useful for tests. */
  fontSpec?: string;
  /** Override line height in px. */
  lineHeightPx?: number;
}

/** Estimates a finished message row for TanStack Virtual. */
export function estimateMessageHeight(
  text: string,
  containerWidth: number,
  opts: EstimateOptions = {},
): number {
  if (!canRun(containerWidth) || !text.trim()) return MIN_HEIGHT;
  try {
    const { height } = layout(
      getHandle(text, opts.fontSpec ?? BODY_FONT),
      containerWidth,
      opts.lineHeightPx ?? LINE_HEIGHT,
    );
    return Math.max(
      MIN_HEIGHT,
      height + BUBBLE_PADDING + (opts.hasCode ? CODE_BLOCK_BONUS : 0),
    );
  } catch {
    return MIN_HEIGHT;
  }
}

/** Estimates a streaming row with slack for incremental growth. */
export function estimateStreamingHeight(
  text: string,
  containerWidth: number,
): number {
  if (!canRun(containerWidth) || !text.trim()) return MIN_HEIGHT;
  try {
    const { height } = layout(
      getHandle(text, BODY_FONT),
      containerWidth,
      LINE_HEIGHT,
    );
    return Math.max(MIN_HEIGHT, height + BUBBLE_PADDING + STREAMING_SLACK);
  } catch {
    return MIN_HEIGHT;
  }
}

/** Finds the narrowest bubble with the max-width line count, clamped to the minimum. */
export function computeTightBubbleWidth(
  text: string,
  maxWidth: number,
  opts: Pick<EstimateOptions, 'fontSpec' | 'lineHeightPx'> = {},
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

export function clearPretextCache(): void {
  cache.clear();
}

export function getPretextCacheSize(): number {
  return cache.size;
}
