import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ActivityStoreService } from './activity-store.service';

describe('ActivityStoreService', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'activity-store-'));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('all returns empty array initially', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    expect(service.all()).toEqual([]);
  });

  test('append adds entry and returns it', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
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
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    service.append([{ id: 'a', type: 'x', message: 'm', timestamp: '' }]);
    service.append([{ id: 'b', type: 'y', message: 'n', timestamp: '' }]);
    expect(service.all()).toHaveLength(2);
  });

  test('clear removes all activities', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    service.append([{ id: '1', type: 'x', message: 'm', timestamp: '' }]);
    service.clear();
    expect(service.all()).toEqual([]);
  });

  test('createWithEntry creates activity with single story entry', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    const first = { id: 'e1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() };
    const entry = service.createWithEntry(first);
    expect(entry.id).toBeDefined();
    expect(entry.created_at).toBeDefined();
    expect(entry.story).toEqual([first]);
    expect(service.all()).toHaveLength(1);
  });

  test('appendEntry adds story entry to existing activity', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    const first = { id: 'e1', type: 'stream_start', message: 'Started', timestamp: '' };
    const created = service.createWithEntry(first);
    const second = { id: 'e2', type: 'step', message: 'Step', timestamp: '' };
    service.appendEntry(created.id, second);
    const updated = service.getById(created.id);
    expect(updated?.story).toHaveLength(2);
    expect(updated?.story).toEqual([first, second]);
  });

  test('appendEntry does nothing for unknown activity id', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    const created = service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    service.appendEntry('unknown-id', { id: 'e2', type: 'y', message: 'n', timestamp: '' });
    const updated = service.getById(created.id);
    expect(updated?.story).toHaveLength(1);
  });

  test('replaceStory overwrites activity story', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    const created = service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    service.appendEntry(created.id, { id: 'e2', type: 'y', message: 'n', timestamp: '' });
    const newStory = [
      { id: 'a', type: 'step', message: 'A', timestamp: '' },
      { id: 'b', type: 'step', message: 'B', timestamp: '' },
    ];
    service.replaceStory(created.id, newStory);
    const updated = service.getById(created.id);
    expect(updated?.story).toEqual(newStory);
  });

  test('replaceStory does nothing for unknown activity id', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    const created = service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    service.replaceStory('unknown-id', []);
    expect(service.getById(created.id)?.story).toHaveLength(1);
  });

  test('replaceStory deduplicates story by id', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
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
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    const first = { id: 'e1', type: 'stream_start', message: 'Started', timestamp: '' };
    const created = service.createWithEntry(first);
    service.appendEntry(created.id, { id: 'e1', type: 'step', message: 'Duplicate id', timestamp: '' });
    const updated = service.getById(created.id);
    expect(updated?.story).toHaveLength(1);
    expect(updated?.story?.[0].message).toBe('Started');
  });

  test('getById returns undefined for unknown id', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    expect(service.getById('unknown')).toBeUndefined();
  });

  test('findByStoryEntryId returns activity containing the story entry', () => {
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
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
    const config = { getDataDir: () => dataDir };
    const service = new ActivityStoreService(config as never);
    service.createWithEntry({ id: 'e1', type: 'x', message: 'm', timestamp: '' });
    expect(service.findByStoryEntryId('other')).toBeUndefined();
  });
});
