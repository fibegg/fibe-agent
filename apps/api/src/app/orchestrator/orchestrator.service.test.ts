import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OrchestratorService } from './orchestrator.service';
import { ActivityStoreService } from '../activity-store/activity-store.service';
import { MessageStoreService } from '../message-store/message-store.service';
import { ModelStoreService } from '../model-store/model-store.service';
import { PlaygroundsService } from '../playgrounds/playgrounds.service';
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
      getSystemPrompt: () => undefined,
      getModelOptions: () => [],
      getDefaultModel: () => '',
    };
    const activityStore = new ActivityStoreService(config as never);
    const messageStore = new MessageStoreService(config as never);
    const modelStore = new ModelStoreService(config as never);
    const strategyRegistry = new StrategyRegistryService();
    const uploadsService = new UploadsService(config as never);
    const playgroundsService = {
      getFileContent: () => {
        throw new Error('not found');
      },
    } as unknown as PlaygroundsService;
    const orch = new OrchestratorService(
      activityStore,
      messageStore,
      modelStore,
      config as never,
      strategyRegistry,
      uploadsService,
      playgroundsService
    );
    await orch.onModuleInit();
    return orch;
  }

  test('handleClientConnected sends auth_status and activity_snapshot', async () => {
    const orch = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    orch.handleClientConnected();
    expect(events.length).toBe(2);
    expect(events[0].type).toBe(WS_EVENT.AUTH_STATUS);
    expect(events[0].data.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
    expect(events[1].type).toBe(WS_EVENT.ACTIVITY_SNAPSHOT);
    expect(events[1].data.activity).toBeDefined();
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

  test('handleClientMessage send_chat_message with audioFilename streams response', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    const uploads = new UploadsService({ getDataDir: () => dataDir } as never);
    const filename = uploads.saveAudioFromBuffer(Buffer.from('audio'), 'audio/webm');
    const events: Array<{ type: string }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage({
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'Hello',
      audioFilename: filename,
    });
    expect(events.some((e) => e.type === WS_EVENT.STREAM_START)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.ERROR)).toBe(false);
  });

  test('handleClientMessage send_chat_message with audio base64 saves and streams', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    const dataUrl = 'data:audio/webm;base64,' + Buffer.from('voice').toString('base64');
    const events: Array<{ type: string }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage({
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'Hi',
      audio: dataUrl,
    });
    expect(events.some((e) => e.type === WS_EVENT.STREAM_START)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.ERROR)).toBe(false);
  });

  test('send_chat_message sends stream_start with model and synthetic thinking_step', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage({ action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });
    const streamStart = events.find((e) => e.type === WS_EVENT.STREAM_START);
    expect(streamStart).toBeDefined();
    expect(streamStart?.data.model).toBeDefined();
    const thinkingStep = events.find((e) => e.type === WS_EVENT.THINKING_STEP);
    expect(thinkingStep).toBeDefined();
    expect(thinkingStep?.data.title).toBe('Generating response');
    expect(thinkingStep?.data.status).toBe('processing');
  });
});
