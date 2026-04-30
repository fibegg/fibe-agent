import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MessageStoreService } from './message-store.service';

describe('MessageStoreService', () => {
  let dataDir: string;

  function makeService() {
    const config = {
      getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined,
    };
    return new MessageStoreService(config as never);
  }

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'msg-store-'));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('all returns empty array initially', () => {
    expect(makeService().all()).toEqual([]);
  });

  test('add appends message and returns it', () => {
    const service = makeService();
    const msg = service.add('user', 'hello');
    expect(msg.role).toBe('user');
    expect(msg.body).toBe('hello');
    expect(msg.id).toBeDefined();
    expect(msg.created_at).toBeDefined();
    expect(service.all().length).toBe(1);
  });

  test('clear removes all messages', () => {
    const service = makeService();
    service.add('user', 'a');
    service.clear();
    expect(service.all()).toEqual([]);
  });

  test('finalizeLastAssistant attaches story to last assistant message', () => {
    const service = makeService();
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
    const service = makeService();
    service.add('user', 'hi');
    service.finalizeLastAssistant([{ id: '1', type: 'x', message: 'm', timestamp: '' }]);
    expect(service.all()[0].story).toBeUndefined();
  });

  test('add with model stores model on message', () => {
    const service = makeService();
    const msg = service.add('assistant', 'hi', undefined, 'gpt-4o');
    expect(msg.model).toBe('gpt-4o');
    expect(service.all()[0].model).toBe('gpt-4o');
  });

  test('finalizeLastAssistant does nothing when messages is empty', () => {
    const service = makeService();
    service.finalizeLastAssistant([{ id: '1', type: 'x', message: 'm', timestamp: '' }]);
    expect(service.all()).toHaveLength(0);
  });

  test('flush persists messages.json immediately', async () => {
    const service = makeService();
    service.add('user', 'durable');
    await service.flush();

    const raw = readFileSync(join(dataDir, 'messages.json'), 'utf8');
    expect(JSON.parse(raw)[0].body).toBe('durable');
  });

  test('onModuleDestroy flushes pending messages.json writes', async () => {
    const service = makeService();
    service.add('assistant', 'shutdown-safe');
    await service.onModuleDestroy();

    expect(existsSync(join(dataDir, 'messages.json'))).toBe(true);
    const raw = readFileSync(join(dataDir, 'messages.json'), 'utf8');
    expect(JSON.parse(raw)[0].body).toBe('shutdown-safe');
  });

  // ──────────────────────────────────────────────
  // reset()
  // ──────────────────────────────────────────────

  test('reset clears the active message list', () => {
    const service = makeService();
    service.add('user', 'msg-1');
    service.add('assistant', 'msg-2');
    service.reset();
    expect(service.all()).toEqual([]);
  });

  test('reset archives current messages to messages.previous.json', async () => {
    const service = makeService();
    service.add('user', 'archived');
    service.reset();
    await service.flush();
    const prevPath = join(dataDir, 'messages.previous.json');
    expect(existsSync(prevPath)).toBe(true);
    const prev = JSON.parse(readFileSync(prevPath, 'utf8'));
    expect(prev).toHaveLength(1);
    expect(prev[0].body).toBe('archived');
  });

  test('reset on empty store does not create messages.previous.json', () => {
    const service = makeService();
    service.reset();
    expect(existsSync(join(dataDir, 'messages.previous.json'))).toBe(false);
  });

  test('reset overwrites previous archive on second reset', async () => {
    const service = makeService();
    service.add('user', 'first');
    service.reset();
    // second reset with new messages
    service.add('user', 'second');
    service.reset();
    await service.flush();
    const prev = JSON.parse(readFileSync(join(dataDir, 'messages.previous.json'), 'utf8'));
    expect(prev).toHaveLength(1);
    expect(prev[0].body).toBe('second');
  });

  test('messages.json is cleared after reset and flush', async () => {
    const service = makeService();
    service.add('user', 'x');
    service.reset();
    await service.flush();
    const raw = readFileSync(join(dataDir, 'messages.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual([]);
  });

  test('hydrate overwrites messages and schedules write', async () => {
    const service = makeService();

    service.hydrate([{ id: '1', role: 'user', body: 'hydrated', created_at: 'now' }]);
    expect(service.all()).toHaveLength(1);
    expect(service.all()[0].body).toBe('hydrated');

    await service.flush();
    const raw = readFileSync(join(dataDir, 'messages.json'), 'utf8');
    expect(JSON.parse(raw)[0].body).toBe('hydrated');
  });
});
