import { createHash } from 'node:crypto';

/**
 * Packing target for one sync request, in UTF-8 bytes of the final JSON body.
 * Items are never altered: one item bigger than this goes alone, at full size.
 */
export const SYNC_BODY_BUDGET_BYTES = 900 * 1024;
/**
 * Fibe API deployments that predate the lifted limit refuse sync bodies over
 * this size (422 from the JSON extractor, or 502 when the proxy sees the API
 * stop reading mid-upload).
 */
export const FIBE_API_BODY_LIMIT_BYTES = 1024 * 1024;

const PACE_MIN_MS = 500;
const PACE_MAX_MS = 10_000;
const PACE_MS_PER_MIB = 2_000;

/** The receiver refuses a whole payload when an item id is longer than this (UTF-8 bytes). */
const MAX_ID_BYTES = 255;
/** Unicode control characters, which the receiver refuses in ids. */
const CONTROL_CHARS = /\p{Cc}/u;

export interface SyncEntry {
  id: string;
  /** Digest of the item's JSON as stored locally. */
  digest: string;
}

export interface SyncBatch {
  /** Each item's JSON text, escaped for embedding inside a JSON string. */
  parts: string[];
  entries: SyncEntry[];
  /** Exact UTF-8 size of `syncBody(parts, conversationId)`. */
  bytes: number;
}

export interface SyncPlan {
  /**
   * Batches within the budget first, then one batch per oversized item.
   * Never empty: with nothing to send it holds one empty batch.
   */
  batches: SyncBatch[];
  /** Ids present in the local content (used to forget vanished items). */
  presentIds: Set<string>;
  /** Items skipped because the receiver would refuse their id. */
  refusedIds: number;
}

/** The content as an item array, or null when it is not a JSON array. */
export function parseSyncItems(content: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Same bytes as `JSON.stringify({ content: '[' + items.join(',') + ']',
 * conversation_id })`, assembled from parts that were escaped once, so a batch
 * never re-serializes the whole content.
 */
export function syncBody(
  parts: readonly string[],
  conversationId: string,
): string {
  return `{"content":"[${parts.join(',')}]","conversation_id":${JSON.stringify(conversationId)}}`;
}

/**
 * Minimum wait before the next flush of the same type and conversation, after
 * a flush that sent `bytes`: 2 s per MiB, between 500 ms and 10 s. A growing
 * multi-MB item is then resent at most every few seconds, not every 500 ms.
 */
export function syncPaceMs(bytes: number): number {
  const proportional = (PACE_MS_PER_MIB * bytes) / (1024 * 1024);
  return Math.min(PACE_MAX_MS, Math.max(PACE_MIN_MS, proportional));
}

/**
 * Splits the items that are not yet synced into consecutive batches whose
 * bodies fit `budget`; an item bigger than that is sent alone, unchanged,
 * after the other batches so it never holds them up. Items the receiver
 * ignores (no id) or refuses (invalid id) are left out; duplicates keep the
 * last occurrence, as the receiver does.
 */
export function planSyncBatches(
  items: readonly unknown[],
  conversationId: string,
  isSynced: (id: string, digest: string) => boolean,
  budget = SYNC_BODY_BUDGET_BYTES,
): SyncPlan {
  const latest = new Map<string, Record<string, unknown>>();
  let refusedIds = 0;
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    const id = item.id;
    if (id === undefined || id === null || id === '') continue;
    if (!acceptedId(id)) {
      refusedIds += 1;
      continue;
    }
    latest.set(id, item);
  }

  const overhead = Buffer.byteLength(syncBody([], conversationId));
  const batches: SyncBatch[] = [];
  const oversized: SyncBatch[] = [];
  let current: SyncBatch = { parts: [], entries: [], bytes: overhead };

  for (const [id, item] of latest) {
    const json = JSON.stringify(item);
    const digest = createHash('sha1').update(json).digest('base64');
    if (isSynced(id, digest)) continue;

    const part = escapeForBody(json);
    const bytes = Buffer.byteLength(part);
    if (overhead + bytes > budget) {
      oversized.push({
        parts: [part],
        entries: [{ id, digest }],
        bytes: overhead + bytes,
      });
      continue;
    }
    if (current.parts.length > 0 && current.bytes + 1 + bytes > budget) {
      batches.push(current);
      current = { parts: [], entries: [], bytes: overhead };
    }
    current.bytes += (current.parts.length > 0 ? 1 : 0) + bytes;
    current.parts.push(part);
    current.entries.push({ id, digest });
  }
  if (current.parts.length > 0) batches.push(current);
  batches.push(...oversized);
  if (batches.length === 0) batches.push(current);

  return { batches, presentIds: new Set(latest.keys()), refusedIds };
}

/** JSON text escaped as the inside of a JSON string literal. */
function escapeForBody(json: string): string {
  return JSON.stringify(json).slice(1, -1);
}

function acceptedId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    Buffer.byteLength(id) <= MAX_ID_BYTES &&
    !CONTROL_CHARS.test(id)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
