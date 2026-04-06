import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ActivityStoreService } from './activity-store.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'activity-store-'));
}

/** Minimal config stub that satisfies ConfigService shape for ActivityStoreService. */
function makeConfig(dataDir: string) {
  return {
    getDataDir: () => dataDir,
    getConversationDataDir: () => dataDir,
    getEncryptionKey: (): string | undefined => undefined,
  } as never; // cast because full ConfigService has additional methods not needed here
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ActivityStoreService', () => {
  let dataDir: string;
  let service: ActivityStoreService;

  beforeEach(() => {
    dataDir = tmpDir();
    service = new ActivityStoreService(makeConfig(dataDir));
  });

  afterEach(async () => {
    // Give the async JSON writer a chance to flush before we delete the dir
    await new Promise((r) => setTimeout(r, 30));
    rmSync(dataDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Core CRUD
  // -------------------------------------------------------------------------

  test('all returns empty array initially', () => {
    expect(service.all()).toEqual([]);
  });

  test('append adds entry and returns it', () => {
    const story = [
      { id: '1', type: 'step', message: 'Thinking', timestamp: new Date().toISOString() },
    ];
    const entry = service.append(story);
    expect(entry.id).toBeDefined();
    expect(entry.created_at).toBeDefined();
    expect(entry.story).toEqual(story);
    expect(service.all()).toHaveLength(1);
  });

  test('append multiple grows array', () => {
    service.append([{ id: 'a', type: 'x', message: 'm', timestamp: '' }]);
    service.append([{ id: 'b', type: 'y', message: 'n', timestamp: '' }]);
    expect(service.all()).toHaveLength(2);
  });

  test('clear removes all activities', () => {
    service.append([{ id: '1', type: 'x', message: 'm', timestamp: '' }]);
    service.clear();
    expect(service.all()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // createWithEntry / appendEntry
  // -------------------------------------------------------------------------

  test('createWithEntry creates activity with single story entry', () => {
    const first = { id: 'e1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() };
    const entry = service.createWithEntry(first);
    expect(entry.id).toBeDefined();
    expect(entry.created_at).toBeDefined();
    expect(entry.story).toEqual([first]);
    expect(service.all()).toHaveLength(1);
  });

  test('appendEntry adds story entry to existing activity', () => {
    const first = { id: 'e1', type: 'stream_start', message: 'Started', timestamp: '' };
    const created = service.createWithEntry(first);
    const second = { id: 'e2', type: 'step', message: 'Step', timestamp: '' };
    service.appendEntry(created.id, second);
    const updated = service.getById(created.id);
    expect(updated?.story).toHaveLength(2);
    expect(updated?.story).toEqual([first, second]);
  });

  test('appendEntry does nothing for unknown activity id', () => {
    const created = service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    service.appendEntry('unknown-id', { id: 'e2', type: 'y', message: 'n', timestamp: '' });
    expect(service.getById(created.id)?.story).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // replaceStory
  // -------------------------------------------------------------------------

  test('replaceStory overwrites activity story', () => {
    const created = service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    service.appendEntry(created.id, { id: 'e2', type: 'y', message: 'n', timestamp: '' });
    const newStory = [
      { id: 'a', type: 'step', message: 'A', timestamp: '' },
      { id: 'b', type: 'step', message: 'B', timestamp: '' },
    ];
    service.replaceStory(created.id, newStory);
    expect(service.getById(created.id)?.story).toEqual(newStory);
  });

  test('replaceStory does nothing for unknown activity id', () => {
    const created = service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    service.replaceStory('unknown-id', []);
    expect(service.getById(created.id)?.story).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // setUsage
  // -------------------------------------------------------------------------

  test('setUsage stores token usage on activity', () => {
    const created = service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    expect(service.getById(created.id)?.usage).toBeUndefined();
    service.setUsage(created.id, { inputTokens: 100, outputTokens: 200 });
    expect(service.getById(created.id)?.usage).toEqual({ inputTokens: 100, outputTokens: 200 });
  });

  test('setUsage does nothing for unknown activity id', () => {
    service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    service.setUsage('unknown-id', { inputTokens: 1, outputTokens: 2 });
    expect(service.all().every((a) => a.usage === undefined)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------

  test('replaceStory deduplicates story by id', () => {
    const created = service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    const withDupes = [
      { id: 'a', type: 'step', message: 'A', timestamp: '' },
      { id: 'b', type: 'step', message: 'B', timestamp: '' },
      { id: 'a', type: 'step', message: 'A again', timestamp: '' },
    ];
    service.replaceStory(created.id, withDupes);
    const updated = service.getById(created.id);
    expect(updated?.story).toHaveLength(2);
    expect(updated?.story?.map((e) => e.id)).toEqual(['a', 'b']);
  });

  test('appendEntry does not add duplicate entry id', () => {
    const first = { id: 'e1', type: 'stream_start', message: 'Started', timestamp: '' };
    const created = service.createWithEntry(first);
    service.appendEntry(created.id, { id: 'e1', type: 'step', message: 'Duplicate id', timestamp: '' });
    const updated = service.getById(created.id);
    expect(updated?.story).toHaveLength(1);
    expect(updated?.story?.[0].message).toBe('Started');
  });

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  test('getById returns undefined for unknown id', () => {
    expect(service.getById('unknown')).toBeUndefined();
  });

  test('findByStoryEntryId returns activity containing the story entry', () => {
    const created = service.createWithEntry({
      id: 's1',
      type: 'stream_start',
      message: 'Start',
      timestamp: '',
    });
    service.appendEntry(created.id, { id: 's2', type: 'step', message: 'Step', timestamp: '' });
    const found = service.findByStoryEntryId('s2');
    expect(found).toEqual(service.getById(created.id));
    expect(found?.id).toBe(created.id);
  });

  test('findByStoryEntryId returns undefined when entry not in any activity', () => {
    service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    expect(service.findByStoryEntryId('other')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  test('loads activities from disk on construction with valid JSON', async () => {
    service.createWithEntry({ id: 'e1', type: 'step', message: 'Loaded', timestamp: '2026-01-01T00:00:00Z' });
    // Wait for async JSON writer to flush
    await new Promise((r) => setTimeout(r, 50));
    // Second service instance reads the same file
    const service2 = new ActivityStoreService(makeConfig(dataDir));
    const activities = service2.all();
    expect(activities.length).toBeGreaterThanOrEqual(1);
    expect(activities[0].story[0].message).toBe('Loaded');
  });

  test('loads gracefully when activities file has corrupt JSON', () => {
    writeFileSync(join(dataDir, 'activity.json'), 'invalid-json-content');
    const svc = new ActivityStoreService(makeConfig(dataDir));
    expect(svc.all()).toEqual([]);
  });

  test('loads gracefully when activities file has non-array JSON', () => {
    writeFileSync(join(dataDir, 'activity.json'), '{"not":"array"}');
    const svc = new ActivityStoreService(makeConfig(dataDir));
    expect(svc.all()).toEqual([]);
  });

  test('load deduplicates story entries with same id from disk', async () => {
    writeFileSync(
      join(dataDir, 'activity.json'),
      JSON.stringify([
        {
          id: 'act1',
          created_at: '2026-01-01',
          story: [
            { id: 's1', type: 'step', message: 'First', timestamp: '' },
            { id: 's1', type: 'step', message: 'Duplicate', timestamp: '' },
            { id: 's2', type: 'step', message: 'Second', timestamp: '' },
          ],
        },
      ])
    );
    const svc = new ActivityStoreService(makeConfig(dataDir));
    const activities = svc.all();
    expect(activities).toHaveLength(1);
    expect(activities[0].story).toHaveLength(2);
    expect(activities[0].story.map((e: { id: string }) => e.id)).toEqual(['s1', 's2']);
  });
});
