import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MessageStoreService } from './message-store.service';

describe('MessageStoreService', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'msg-store-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('all returns empty array initially', () => {
    const config = { getDataDir: () => dataDir };
    const service = new MessageStoreService(config as never);
    expect(service.all()).toEqual([]);
  });

  test('add appends message and returns it', () => {
    const config = { getDataDir: () => dataDir };
    const service = new MessageStoreService(config as never);
    const msg = service.add('user', 'hello');
    expect(msg.role).toBe('user');
    expect(msg.body).toBe('hello');
    expect(msg.id).toBeDefined();
    expect(msg.created_at).toBeDefined();
    expect(service.all().length).toBe(1);
  });

  test('clear removes all messages', () => {
    const config = { getDataDir: () => dataDir };
    const service = new MessageStoreService(config as never);
    service.add('user', 'a');
    service.clear();
    expect(service.all()).toEqual([]);
  });

  test('setStoryForLastAssistant attaches story to last assistant message', () => {
    const config = { getDataDir: () => dataDir };
    const service = new MessageStoreService(config as never);
    service.add('user', 'hi');
    service.add('assistant', 'hello');
    const story = [
      { id: '1', type: 'step', message: 'Thinking', timestamp: new Date().toISOString() },
    ];
    service.setStoryForLastAssistant(story);
    const all = service.all();
    expect(all).toHaveLength(2);
    expect(all[1].story).toEqual(story);
  });

  test('setStoryForLastAssistant does nothing when last message is not assistant', () => {
    const config = { getDataDir: () => dataDir };
    const service = new MessageStoreService(config as never);
    service.add('user', 'hi');
    service.setStoryForLastAssistant([{ id: '1', type: 'x', message: 'm', timestamp: '' }]);
    expect(service.all()[0].story).toBeUndefined();
  });

  test('setStoryForLastAssistant does nothing when messages is empty', () => {
    const config = { getDataDir: () => dataDir };
    const service = new MessageStoreService(config as never);
    service.setStoryForLastAssistant([{ id: '1', type: 'x', message: 'm', timestamp: '' }]);
    expect(service.all()).toHaveLength(0);
  });
});
