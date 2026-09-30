import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MessageStoreService } from './message-store.service';
import { DataPrivacyService } from '../data-privacy/data-privacy.service';

describe('MessageStoreService', () => {
  let dataDir: string;
  let services: MessageStoreService[];

  function makeService() {
    const config = {
      getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined,
    };
    const service = new MessageStoreService(config as never);
    services.push(service);
    return service;
  }

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'msg-store-'));
    services = [];
  });

  afterEach(async () => {
    await Promise.all(services.map((service) => service.onModuleDestroy()));
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('all returns empty array initially', () => {
    expect(makeService().all()).toEqual([]);
  });

  test('ordinary legacy arrays and archives remain arrays; explicit generation persists with restrictive permissions', async () => {
    writeFileSync(join(dataDir, 'messages.json'), JSON.stringify([{ id: 'legacy', role: 'user', body: 'history', created_at: 'old' }]));
    const service = makeService();
    expect(existsSync(join(dataDir, 'message-store-generation.json'))).toBe(false);
    const generation = service.deliveryGeneration();
    expect(makeService().deliveryGeneration()).toBe(generation);
    expect(statSync(join(dataDir, 'message-store-generation.json')).mode & 0o777).toBe(0o600);
    service.reset();
    await service.flush(true);
    expect(Array.isArray(JSON.parse(readFileSync(join(dataDir, 'messages.previous.json'), 'utf8')))).toBe(true);
    expect(Array.isArray(JSON.parse(readFileSync(join(dataDir, 'messages.json'), 'utf8')))).toBe(true);
    expect(service.matchesGeneration(generation)).toBe(false);
  });

  test('a separate legacy writer rotates shared generation on clear and privacy deletion rejects old scope', () => {
    const service = makeService();
    const legacyWriter = makeService();
    const generation = service.deliveryGeneration();
    legacyWriter.clear();
    expect(service.matchesGeneration(generation)).toBe(false);
    const next = service.deliveryGeneration();
    rmSync(dataDir, { recursive: true, force: true });
    expect(service.matchesGeneration(next)).toBe(false);
    expect(makeService().deliveryGeneration()).not.toBe(next);
  });

  test('actual privacy export keeps the array contract and actual delete invalidates the shared delivery scope', () => {
    const service = makeService();
    const legacyWriter = makeService();
    const generation = service.deliveryGeneration();
    service.add('user', 'manual history');
    const privacy = new DataPrivacyService(
      { getConversationDataDir: () => dataDir, getConversationId: () => 'default' } as never,
      legacyWriter,
      { all: () => [], clear: () => undefined } as never,
      { get: () => 'model' } as never,
      { get: () => 'effort' } as never,
    );
    expect(Array.isArray(privacy.exportData().messages)).toBe(true);
    privacy.deleteData();
    expect(service.matchesGeneration(generation)).toBe(false);
    expect(makeService().deliveryGeneration()).not.toBe(generation);
  });

  test('restoring array history without its sidecar cannot cross the running boundary; complete restore retains identity', async () => {
    const service = makeService();
    const generation = service.deliveryGeneration();
    const id = '4514ad73-8519-42e4-b268-ce7e141cb9e9';
    service.add('user', 'pending', undefined, undefined, undefined, { id, metadata: { storeGeneration: generation, fingerprint: 'binding', text: 'pending', busyPolicy: 'queue', state: 'pending' } });
    await service.flush(true);
    copyFileSync(join(dataDir, 'message-store-generation.json'), join(dataDir, 'generation-backup.json'));
    rmSync(join(dataDir, 'message-store-generation.json'));
    const restored = makeService();
    await expect(restored.updateRequestState(id, 'running')).rejects.toThrow('STORE_GENERATION_CHANGED');
    copyFileSync(join(dataDir, 'generation-backup.json'), join(dataDir, 'message-store-generation.json'));
    await restored.updateRequestState(id, 'running');
    expect(restored.getById(id)?.apiRequest?.state).toBe('running');
  });

  test('deleting an intentional caller receipt rotates generation, but ordinary message deletion retains it', () => {
    const service = makeService();
    const generation = service.deliveryGeneration();
    const ordinary = service.add('user', 'manual');
    service.removeById(ordinary.id);
    expect(service.matchesGeneration(generation)).toBe(true);
    const id = '5514ad73-8519-42e4-b268-ce7e141cb9e9';
    service.add('user', 'caller', undefined, undefined, undefined, { id, metadata: { storeGeneration: generation, fingerprint: 'binding', text: 'caller', busyPolicy: 'queue', state: 'pending' } });
    service.removeById(id);
    expect(service.matchesGeneration(generation)).toBe(false);
  });

  test('a restored sidecar without history gets a fresh scope and corrupt history fails closed until explicit reset', async () => {
    const service = makeService();
    const original = service.deliveryGeneration();
    rmSync(join(dataDir, 'messages.json'));
    expect(service.matchesGeneration(original)).toBe(false);
    expect(makeService().deliveryGeneration()).not.toBe(original);
    writeFileSync(join(dataDir, 'messages.json'), '{broken');
    const corrupt = makeService();
    expect(() => corrupt.deliveryGeneration()).toThrow('corrupt message history');
    corrupt.clear();
    await corrupt.flush(true);
    expect(corrupt.deliveryGeneration()).toBeDefined();
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

  test('add persists attachment filenames', () => {
    const service = makeService();
    const msg = service.add('user', 'review files', undefined, undefined, [
      'notes.zip',
    ]);
    expect(msg.attachmentFilenames).toEqual(['notes.zip']);
    expect(service.all()[0].attachmentFilenames).toEqual(['notes.zip']);
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
      {
        id: '1',
        type: 'step',
        message: 'Thinking',
        timestamp: new Date().toISOString(),
      },
    ];
    service.finalizeLastAssistant(story);
    const all = service.all();
    expect(all).toHaveLength(2);
    expect(all[1].story).toEqual(story);
  });

  test('finalizeLastAssistant does nothing when last message is not assistant', () => {
    const service = makeService();
    service.add('user', 'hi');
    service.finalizeLastAssistant([
      { id: '1', type: 'x', message: 'm', timestamp: '' },
    ]);
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
    service.finalizeLastAssistant([
      { id: '1', type: 'x', message: 'm', timestamp: '' },
    ]);
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
    service.add('user', 'second');
    service.reset();
    await service.flush();
    const prev = JSON.parse(
      readFileSync(join(dataDir, 'messages.previous.json'), 'utf8'),
    );
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

    service.hydrate([
      { id: '1', role: 'user', body: 'hydrated', created_at: 'now' },
    ]);
    expect(service.all()).toHaveLength(1);
    expect(service.all()[0].body).toBe('hydrated');

    await service.flush();
    const raw = readFileSync(join(dataDir, 'messages.json'), 'utf8');
    expect(JSON.parse(raw)[0].body).toBe('hydrated');
  });

  test('lagging hydrated history cannot erase or rewind local caller execution receipts', async () => {
    const service = makeService();
    const id = 'a514ad73-8519-42e4-b268-ce7e141cb9e9';
    service.add('user', 'local occurrence', undefined, undefined, undefined, {
      id, metadata: { storeGeneration: service.deliveryGeneration(), fingerprint: 'binding', text: 'local occurrence', busyPolicy: 'queue', state: 'pending' },
    });
    await service.updateRequestState(id, 'running');
    service.hydrate([{ id, role: 'user', body: 'stale remote', created_at: 'old',
      apiRequest: { fingerprint: 'binding', text: 'local occurrence', busyPolicy: 'queue', state: 'pending' } }]);
    expect(service.getById(id)?.apiRequest?.state).toBe('running');
    expect(service.getById(id)?.body).toBe('local occurrence');
    service.hydrate([{ id: 'another', role: 'user', body: 'other history', created_at: 'old' }]);
    await service.flush(true);
    const persisted = makeService();
    expect(persisted.getById(id)?.apiRequest?.state).toBe('running');
    expect(persisted.getById('another')?.body).toBe('other history');
  });
});
