import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentModeStoreService } from './agent-mode.store.service';
import { DEFAULT_AGENT_MODE, AGENT_MODES } from '@shared/agent-mode.constants';

function makeConfig(dataDir: string) {
  return {
    getDataDir: () => dataDir,
    getConversationDataDir: () => dataDir,
    getEncryptionKey: () => undefined,
  };
}

describe('AgentModeStoreService', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'agent-mode-store-'));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('get returns default mode when no file exists', () => {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    expect(service.get()).toBe(DEFAULT_AGENT_MODE);
  });

  test('set with a canonical key resolves to display string', () => {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    const result = service.set('casting');
    expect(result).toBe(AGENT_MODES.casting);
    expect(service.get()).toBe(AGENT_MODES.casting);
  });

  test('set with a display string is accepted (backwards compat)', () => {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    const result = service.set('Casting...');
    expect(result).toBe(AGENT_MODES.casting);
    expect(service.get()).toBe(AGENT_MODES.casting);
  });

  test('set with MODE:BUILD trigger resolves to Building display string', () => {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    const result = service.set('MODE:BUILD');
    expect(result).toBe(AGENT_MODES.build);
    expect(service.get()).toBe(AGENT_MODES.build);
  });

  test('legacy greenfield and brownfield values resolve to Building', () => {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    expect(service.set('greenfielding')).toBe(AGENT_MODES.build);
    expect(service.set('Brownfielding...')).toBe(AGENT_MODES.build);
    expect(service.set('MODE:GREENFIELD')).toBe(AGENT_MODES.build);
    expect(service.set('MODE:BROWNFIELD')).toBe(AGENT_MODES.build);
  });

  test('set with unknown value returns null and does not change stored mode', () => {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    const result = service.set('hacking');
    expect(result).toBeNull();
    expect(service.get()).toBe(DEFAULT_AGENT_MODE);
  });

  test('set with whitespace-padded key is accepted', () => {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    const result = service.set('  exploring  ');
    expect(result).toBe(AGENT_MODES.exploring);
  });

  test('all canonical keys are accepted', () => {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    const keys = ['exploring', 'casting', 'overseeing', 'build'] as const;
    for (const key of keys) {
      expect(service.set(key)).not.toBeNull();
    }
  });

  test('flush persists mode.json', async () => {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    service.set('overseeing');
    await service.flush();

    const raw = readFileSync(join(dataDir, 'mode.json'), 'utf8');
    const data = JSON.parse(raw) as { mode: string };
    expect(data.mode).toBe(AGENT_MODES.overseeing);
  });

  test('get uses cache after first read', () => {
    const service = new AgentModeStoreService(makeConfig(dataDir) as never);
    service.set('build');
    expect(service.get()).toBe(AGENT_MODES.build);
    expect(service.get()).toBe(AGENT_MODES.build);
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
    const service1 = new AgentModeStoreService(makeConfig(dataDir) as never);
    service1.set('casting');
    await service1.flush();

    // Simulate restart with a fresh instance
    const service2 = new AgentModeStoreService(makeConfig(dataDir) as never);
    expect(service2.get()).toBe(AGENT_MODES.casting);
  });
});
