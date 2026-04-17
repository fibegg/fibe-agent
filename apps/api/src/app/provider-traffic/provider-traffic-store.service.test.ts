import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProviderTrafficStoreService } from './provider-traffic-store.service';
import type { CapturedProviderRequest } from './types';

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'traffic-store-'));
}

function makeConfig(dataDir: string) {
  return {
    getDataDir: () => dataDir,
    getConversationDataDir: () => dataDir,
    getEncryptionKey: (): string | undefined => undefined,
  } as never;
}

function makeFibeSync() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    syncRawProviders: () => {},
  } as never;
}

function makeSampleRecord(overrides?: Partial<CapturedProviderRequest>): CapturedProviderRequest {
  return {
    id: 'test-id-1',
    timestamp: '2026-04-12T10:00:00.000Z',
    provider: 'anthropic',
    request: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'content-type': 'application/json' },
      body: '{"model":"claude-sonnet-4-20250514"}',
      bodyTruncated: false,
    },
    response: {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/event-stream' },
      body: 'data: {"type":"message_start"}',
      bodyTruncated: false,
    },
    durationMs: 1500,
    bytesReceived: 2048,
    bytesSent: 512,
    isStreaming: true,
    error: null,
    usage: { inputTokens: 100, outputTokens: 50 },
    ...overrides,
  };
}

describe('ProviderTrafficStoreService', () => {
  let dataDir: string;
  let service: ProviderTrafficStoreService;

  beforeEach(() => {
    dataDir = tmpDir();
    service = new ProviderTrafficStoreService(makeConfig(dataDir), makeFibeSync());
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('starts with empty records', () => {
    expect(service.all()).toEqual([]);
  });

  test('append adds a record', () => {
    const record = makeSampleRecord();
    service.append(record);
    expect(service.all()).toHaveLength(1);
    expect(service.all()[0].id).toBe('test-id-1');
  });

  test('persists records to disk', async () => {
    service.append(makeSampleRecord());
    service.append(makeSampleRecord({ id: 'test-id-2', provider: 'openai' }));

    // Wait for async write
    await new Promise((r) => setTimeout(r, 100));

    const filePath = join(dataDir, 'raw-providers.json');
    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe('test-id-1');
    expect(data[1].provider).toBe('openai');
  });

  test('loads existing records from disk on construction', async () => {
    const record = makeSampleRecord();
    service.append(record);

    await new Promise((r) => setTimeout(r, 100));

    // Create new service instance pointing to same dir
    const service2 = new ProviderTrafficStoreService(makeConfig(dataDir), makeFibeSync());
    expect(service2.all()).toHaveLength(1);
    expect(service2.all()[0].id).toBe('test-id-1');
  });

  test('clear removes all records', async () => {
    service.append(makeSampleRecord());
    expect(service.all()).toHaveLength(1);

    service.clear();
    expect(service.all()).toEqual([]);

    await new Promise((r) => setTimeout(r, 100));
    const filePath = join(dataDir, 'raw-providers.json');
    const raw = readFileSync(filePath, 'utf-8');
    expect(JSON.parse(raw)).toEqual([]);
  });
});
