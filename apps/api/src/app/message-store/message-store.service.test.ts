import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MessageStoreService } from './message-store.service';

describe('MessageStoreService', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'msg-store-'));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('all returns empty array initially', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined };
    const service = new MessageStoreService(config as never);
    expect(service.all()).toEqual([]);
  });

  test('add appends message and returns it', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined };
    const service = new MessageStoreService(config as never);
    const msg = service.add('user', 'hello');
    expect(msg.role).toBe('user');
    expect(msg.body).toBe('hello');
    expect(msg.id).toBeDefined();
    expect(msg.created_at).toBeDefined();
    expect(service.all().length).toBe(1);
  });

  test('clear removes all messages', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined };
    const service = new MessageStoreService(config as never);
    service.add('user', 'a');
    service.clear();
    expect(service.all()).toEqual([]);
  });

  test('finalizeLastAssistant attaches story to last assistant message', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined };
    const service = new MessageStoreService(config as never);
    service.add('user', 'hi');
    service.add('assistant', 'hello');
    const story = [
      { id: '1', type: 'step', message: 'Thinking', timestamp: new Date().toISOString() },
    ];
    service.finalizeLastAssistant(story);
    const all = service.all();
    expect(all).toHaveLength(2);
    expect(all[1].story).toEqual(story);
  });

  test('finalizeLastAssistant does nothing when last message is not assistant', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined };
    const service = new MessageStoreService(config as never);
    service.add('user', 'hi');
    service.finalizeLastAssistant([{ id: '1', type: 'x', message: 'm', timestamp: '' }]);
    expect(service.all()[0].story).toBeUndefined();
  });

  test('add with model stores model on message', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined };
    const service = new MessageStoreService(config as never);
    const msg = service.add('assistant', 'hi', undefined, 'gpt-4o');
    expect(msg.model).toBe('gpt-4o');
    expect(service.all()[0].model).toBe('gpt-4o');
  });

  test('finalizeLastAssistant does nothing when messages is empty', () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined };
    const service = new MessageStoreService(config as never);
    service.finalizeLastAssistant([{ id: '1', type: 'x', message: 'm', timestamp: '' }]);
    expect(service.all()).toHaveLength(0);
  });

  test('flush persists messages.json immediately', async () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined };
    const service = new MessageStoreService(config as never);

    service.add('user', 'durable');
    await service.flush();

    const raw = readFileSync(join(dataDir, 'messages.json'), 'utf8');
    expect(JSON.parse(raw)[0].body).toBe('durable');
  });

  test('onModuleDestroy flushes pending messages.json writes', async () => {
    const config = { getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined };
    const service = new MessageStoreService(config as never);

    service.add('assistant', 'shutdown-safe');
    await service.onModuleDestroy();

    expect(existsSync(join(dataDir, 'messages.json'))).toBe(true);
    const raw = readFileSync(join(dataDir, 'messages.json'), 'utf8');
    expect(JSON.parse(raw)[0].body).toBe('shutdown-safe');
  });
});
