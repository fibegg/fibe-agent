import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  type Mock,
} from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentModeStoreService } from './agent-mode.store.service';
import { SequentialJsonWriter } from '../persistence/sequential-json-writer';
import { DEFAULT_AGENT_MODE, AGENT_MODES } from '@shared/agent-mode.constants';

function makeConfig(dataDir: string) {
  return {
    getDataDir: () => dataDir,
    getConversationDataDir: () => dataDir,
    getEncryptionKey: () => undefined,
  };
}

type AtomicWriter = { writeAtomically(data: string): Promise<void> };

describe('AgentModeStoreService', () => {
  let dataDir: string;
  let services: AgentModeStoreService[];
  /** Payloads the store asked to persist; null while real disk I/O is in use. */
  let persisted: string[] | null;
  let diskWrite: Mock<(data: string) => Promise<void>> | null;

  function makeService() {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    services.push(service);
    return service;
  }

  /**
   * Mode-resolution tests do not assert durability, so they record the
   * serialized snapshot instead of fsyncing it: a slow CI disk cannot make
   * their teardown flush exceed the hook timeout. Persistence tests below use
   * the real atomic writer.
   */
  function recordWritesInMemory() {
    persisted = [];
    diskWrite = spyOn(
      SequentialJsonWriter.prototype as unknown as AtomicWriter,
      'writeAtomically',
    ).mockImplementation(async (data: string) => {
      persisted?.push(data);
    });
  }

  function lastPersistedMode(): string | undefined {
    const last = persisted?.at(-1);
    return last === undefined
      ? undefined
      : (JSON.parse(last) as { mode: string }).mode;
  }

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'agent-mode-store-'));
    services = [];
    persisted = null;
    diskWrite = null;
  });

  afterEach(async () => {
    const cleanupDir = dataDir;
    await Promise.all(services.map((service) => service.onModuleDestroy()));
    diskWrite?.mockRestore();
    rmSync(cleanupDir, { recursive: true, force: true });
  });

  describe('mode resolution (writes recorded in memory)', () => {
    beforeEach(() => {
      recordWritesInMemory();
    });

    test('get returns default mode when no file exists', () => {
      const service = makeService();
      expect(service.get()).toBe(DEFAULT_AGENT_MODE);
    });

    test('set with a canonical key resolves to display string', async () => {
      const service = makeService();
      const result = service.set('casting');
      expect(result).toBe(AGENT_MODES.casting);
      expect(service.get()).toBe(AGENT_MODES.casting);
      await service.flush();
      expect(lastPersistedMode()).toBe(AGENT_MODES.casting);
    });

    test('set with a display string is accepted', () => {
      const service = makeService();
      const result = service.set('Casting...');
      expect(result).toBe(AGENT_MODES.casting);
      expect(service.get()).toBe(AGENT_MODES.casting);
    });

    test('set with MODE:BUILD trigger resolves to Building display string', () => {
      const service = makeService();
      const result = service.set('MODE:BUILD');
      expect(result).toBe(AGENT_MODES.build);
      expect(service.get()).toBe(AGENT_MODES.build);
    });

    test('retired MODE:GREENFIELD/BROWNFIELD trigger words are rejected', () => {
      const service = makeService();
      expect(service.set('MODE:GREENFIELD')).toBeNull();
      expect(service.set('MODE:BROWNFIELD')).toBeNull();
      expect(service.get()).toBe(DEFAULT_AGENT_MODE);
      expect(persisted).toEqual([]);
    });

    test('set with unknown value returns null and does not change stored mode', () => {
      const service = makeService();
      const result = service.set('hacking');
      expect(result).toBeNull();
      expect(service.get()).toBe(DEFAULT_AGENT_MODE);
    });

    test('set with whitespace-padded key is accepted', () => {
      const service = makeService();
      const result = service.set('  exploring  ');
      expect(result).toBe(AGENT_MODES.exploring);
    });

    test('all canonical keys are accepted', async () => {
      const service = makeService();
      const keys = ['exploring', 'casting', 'overseeing', 'build'] as const;
      for (const key of keys) {
        expect(service.set(key)).not.toBeNull();
      }
      await service.flush();
      expect(persisted).toHaveLength(keys.length);
      expect(lastPersistedMode()).toBe(AGENT_MODES.build);
    });

    test('get uses cache after first read', () => {
      const service = makeService();
      service.set('build');
      expect(service.get()).toBe(AGENT_MODES.build);
      expect(service.get()).toBe(AGENT_MODES.build);
    });
  });

  describe('persistence (real atomic writes)', () => {
    test('flush persists mode.json', async () => {
      const service = makeService();
      service.set('overseeing');
      await service.flush();

      const raw = readFileSync(join(dataDir, 'mode.json'), 'utf8');
      const data = JSON.parse(raw) as { mode: string };
      expect(data.mode).toBe(AGENT_MODES.overseeing);
    });

    test('onModuleDestroy flushes pending writes', async () => {
      const service = new AgentModeStoreService(makeConfig(dataDir) as never);
      service.set('build');
      await service.onModuleDestroy();

      const raw = readFileSync(join(dataDir, 'mode.json'), 'utf8');
      const data = JSON.parse(raw) as { mode: string };
      expect(data.mode).toBe(AGENT_MODES.build);
    });

    test('get reads previously persisted value from disk', async () => {
      const service1 = makeService();
      service1.set('casting');
      await service1.flush();

      const service2 = makeService();
      expect(service2.get()).toBe(AGENT_MODES.casting);
    });
  });
});
