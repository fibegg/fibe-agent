import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  parseSyncItems,
  planSyncBatches,
  syncBody,
  syncPaceMs,
  SYNC_BODY_BUDGET_BYTES,
} from './fibe-sync-batches';

function digest(item: unknown): string {
  return createHash('sha1').update(JSON.stringify(item)).digest('base64');
}

const nothingSynced = () => false;

describe('fibe sync batches', () => {
  test('a batch body is byte-identical to stringifying the batch content', () => {
    const items = [
      { id: 'a', body: 'quote " backslash \\ newline \n tab \t é 😀 \u0001' },
      { id: 'b', nested: { list: [1, null, true, 'x'] } },
    ];
    const plan = planSyncBatches(items, 'conv "1"', nothingSynced);
    expect(plan.batches).toHaveLength(1);
    const body = syncBody(plan.batches[0].parts, 'conv "1"');
    expect(body).toBe(
      JSON.stringify({
        content: JSON.stringify(items),
        conversation_id: 'conv "1"',
      }),
    );
    expect(plan.batches[0].bytes).toBe(Buffer.byteLength(body));
  });

  test('skips ignored and refused ids, keeps the last duplicate and unchanged items stay out', () => {
    const items = [
      { id: 'keep', body: 'old' },
      { body: 'no id' },
      { id: '', body: 'empty id' },
      { id: null },
      'not an object',
      { id: 42 },
      { id: 'x'.repeat(256) },
      { id: 'bad\u0007id' },
      { id: 'same', body: 'unchanged' },
      { id: 'keep', body: 'new' },
    ];
    const synced = new Map([
      ['same', digest({ id: 'same', body: 'unchanged' })],
    ]);
    const plan = planSyncBatches(
      items,
      'default',
      (id, itemDigest) => synced.get(id) === itemDigest,
    );
    expect(plan.refusedIds).toBe(3);
    expect([...plan.presentIds]).toEqual(['keep', 'same']);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0].entries.map((e) => e.id)).toEqual(['keep']);
    expect(
      JSON.parse(
        JSON.parse(syncBody(plan.batches[0].parts, 'default')).content,
      ),
    ).toEqual([{ id: 'keep', body: 'new' }]);
  });

  test('nothing changed still yields one empty batch', () => {
    const plan = planSyncBatches([], 'default', nothingSynced);
    expect(plan.batches).toHaveLength(1);
    expect(syncBody(plan.batches[0].parts, 'default')).toBe(
      JSON.stringify({ content: '[]', conversation_id: 'default' }),
    );
  });

  test('only JSON arrays are treated as item lists', () => {
    expect(parseSyncItems('[{"id":"a"}]')).toEqual([{ id: 'a' }]);
    expect(parseSyncItems('{"data":"test"}')).toBeNull();
    expect(parseSyncItems('not json')).toBeNull();
  });
  test('packs within the budget and sends each oversized item alone, unchanged, last', () => {
    const item = (id: string, size: number) => ({ id, body: 'b'.repeat(size) });
    const items = [
      item('s1', 400_000),
      item('big1', 1_000_000),
      item('s2', 400_000),
      item('s3', 400_000),
      item('big2', 2_000_000),
    ];
    const plan = planSyncBatches(items, 'default', nothingSynced);
    expect(plan.batches.map((b) => b.entries.map((e) => e.id))).toEqual([
      ['s1', 's2'],
      ['s3'],
      ['big1'],
      ['big2'],
    ]);
    for (const batch of plan.batches.slice(0, 2)) {
      expect(batch.bytes).toBeLessThanOrEqual(SYNC_BODY_BUDGET_BYTES);
    }
    const big2 = plan.batches[3];
    expect(big2.bytes).toBe(Buffer.byteLength(syncBody(big2.parts, 'default')));
    expect(JSON.parse(syncBody(big2.parts, 'default')).content).toBe(
      JSON.stringify([items[4]]),
    );
  });

  test('pacing is 2 s per MiB sent, between 500 ms and 10 s', () => {
    expect(syncPaceMs(0)).toBe(500);
    expect(syncPaceMs(100 * 1024)).toBe(500);
    expect(syncPaceMs(1024 * 1024)).toBe(2_000);
    expect(syncPaceMs(3 * 1024 * 1024)).toBe(6_000);
    expect(syncPaceMs(50 * 1024 * 1024)).toBe(10_000);
  });
});
