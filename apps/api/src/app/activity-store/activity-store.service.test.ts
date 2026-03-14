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

  afterEach(() => {
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
});
