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
});
