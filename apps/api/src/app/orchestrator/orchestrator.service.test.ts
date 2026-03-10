import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OrchestratorService } from './orchestrator.service';
import { MessageStoreService } from '../message-store/message-store.service';
import { ModelStoreService } from '../model-store/model-store.service';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import { UploadsService } from '../uploads/uploads.service';
import { WS_ACTION, WS_EVENT, AUTH_STATUS } from '../ws.constants';

describe('OrchestratorService', () => {
  let dataDir: string;
  const envBackup = process.env.AGENT_PROVIDER;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'orch-'));
    process.env.AGENT_PROVIDER = 'mock';
  });

  afterEach(() => {
    process.env.AGENT_PROVIDER = envBackup;
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function createOrchestrator(): Promise<OrchestratorService> {
    const config = {
      getDataDir: () => dataDir,
      getSystemPromptPath: () => join(dataDir, 'nonexistent.md'),
      getModelOptions: () => [],
    };
    const messageStore = new MessageStoreService(config as never);
    const modelStore = new ModelStoreService(config as never);
    const strategyRegistry = new StrategyRegistryService();
    const uploadsService = new UploadsService(config as never);
    const orch = new OrchestratorService(
      messageStore,
      modelStore,
      config as never,
      strategyRegistry,
      uploadsService
    );
    await orch.onModuleInit();
    return orch;
  }

  test('handleClientConnected sends auth_status', async () => {
    const orch = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    orch.handleClientConnected();
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.AUTH_STATUS);
    expect(events[0].data.status).toBe(AUTH_STATUS.AUTHENTICATED);
  });

  test('handleClientMessage get_model sends model_updated', async () => {
    const orch = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    orch.handleClientMessage({ action: WS_ACTION.GET_MODEL });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.MODEL_UPDATED);
    expect(events[0].data.model).toBeDefined();
  });

  test('handleClientMessage set_model sends model_updated with value', async () => {
    const orch = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    orch.handleClientMessage({ action: WS_ACTION.SET_MODEL, model: 'gemini-2' });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.MODEL_UPDATED);
    expect(events[0].data.model).toBe('gemini-2');
  });

  test('handleClientMessage send_chat_message without auth sends error NEED_AUTH', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = false;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage({ action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });
    expect(events.some((e) => e.type === WS_EVENT.ERROR && e.data.message === 'NEED_AUTH')).toBe(true);
  });

  test('handleClientMessage check_auth_status sends auth_status', async () => {
    const orch = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage({ action: WS_ACTION.CHECK_AUTH_STATUS });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.AUTH_STATUS);
  });
});
