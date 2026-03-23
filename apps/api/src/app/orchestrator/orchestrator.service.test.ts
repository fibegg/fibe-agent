import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OrchestratorService } from './orchestrator.service';
import { ActivityStoreService } from '../activity-store/activity-store.service';
import { MessageStoreService } from '../message-store/message-store.service';
import { ModelStoreService } from '../model-store/model-store.service';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import { UploadsService } from '../uploads/uploads.service';
import { SteeringService } from '../steering/steering.service';
import { WS_ACTION, WS_EVENT, AUTH_STATUS, ERROR_CODE } from '../ws.constants';

describe('OrchestratorService', () => {
  let dataDir: string;
  let lastSteering: SteeringService | undefined;
  const envBackup = process.env.AGENT_PROVIDER;

  beforeEach(() => {
    lastSteering = undefined;
    dataDir = mkdtempSync(join(tmpdir(), 'orch-'));
    process.env.AGENT_PROVIDER = 'mock';
  });

  afterEach(async () => {
    process.env.AGENT_PROVIDER = envBackup;
    await lastSteering?.awaitPendingWrites();
    await new Promise((r) => setTimeout(r, 50));
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function createOrchestrator(): Promise<OrchestratorService> {
    const config = {
      getDataDir: () => dataDir,
      getConversationDataDir: () => dataDir,
      getSystemPromptPath: () => join(dataDir, 'nonexistent.md'),
      getSystemPrompt: () => undefined,
      getModelOptions: () => [],
      getDefaultModel: () => '',
    };
    const activityStore = new ActivityStoreService(config as never);
    const messageStore = new MessageStoreService(config as never);
    const modelStore = new ModelStoreService(config as never);
    const strategyRegistry = new StrategyRegistryService(config as never);
    const uploadsService = new UploadsService(config as never);
    const phoenixSync = {
      syncMessages: async (payload: string) => {
        void payload;
      },
      syncActivity: async (payload: string) => {
        void payload;
      },
    } as unknown as import('../phoenix-sync/phoenix-sync.service').PhoenixSyncService;
    const chatPromptContext = {
      buildFullPrompt: async (
        text: string,
        _imageUrls: string[],
        _audioFilename: string | null,
        _attachmentFilenames?: string[],
      ) => text.trim(),
    } as unknown as import('./chat-prompt-context.service').ChatPromptContextService;
    const steering = new SteeringService(config as never);
    lastSteering = steering;
    steering.onModuleInit();
    const orch = new OrchestratorService(
      activityStore,
      messageStore,
      modelStore,
      config as never,
      strategyRegistry,
      uploadsService,
      phoenixSync,
      chatPromptContext,
      steering,
    );
    await orch.onModuleInit();
    return orch;
  }

  test('handleClientConnected sends auth_status, activity_snapshot, and queue_updated', async () => {
    const orch = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    orch.handleClientConnected();
    expect(events.length).toBe(3);
    expect(events[0].type).toBe(WS_EVENT.AUTH_STATUS);
    expect(events[0].data.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
    expect(events[1].type).toBe(WS_EVENT.ACTIVITY_SNAPSHOT);
    expect(events[1].data.activity).toBeDefined();
    expect(events[2].type).toBe(WS_EVENT.QUEUE_UPDATED);
    expect(events[2].data.count).toBeDefined();
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
    const uploads = new UploadsService({ getDataDir: () => dataDir, getConversationDataDir: () => dataDir } as never);
    const filename = await uploads.saveAudioFromBuffer(Buffer.from('audio'), 'audio/webm');
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

  test('send_chat_message sends stream_end with model', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage({ action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });
    const streamEnd = events.find((e) => e.type === WS_EVENT.STREAM_END);
    expect(streamEnd).toBeDefined();
    expect(streamEnd?.data.model).toBeDefined();
    expect(typeof streamEnd?.data.model).toBe('string');
  });

  test('handleClientMessage interrupt_agent when not processing does nothing', async () => {
    const orch = await createOrchestrator();
    const events: Array<{ type: string }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    orch.handleClientMessage({ action: WS_ACTION.INTERRUPT_AGENT });
    expect(events.length).toBe(0);
  });

  test('handleClientMessage interrupt_agent when processing sends stream_end with accumulated', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    const events: Array<{ type: string }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    const promise = orch.handleClientMessage({ action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });
    orch.handleClientMessage({ action: WS_ACTION.INTERRUPT_AGENT });
    await promise;
    expect(events.some((e) => e.type === WS_EVENT.STREAM_START)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(true);
    expect(orch.isProcessing).toBe(false);
  });

  test('send_chat_message while processing queues the message instead of blocking', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    const promise = orch.handleClientMessage({ action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'first' });
    // While processing, send another message — should be queued
    await orch.handleClientMessage({ action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'queued msg' });
    await promise;
    const queueEvents = events.filter((e) => e.type === WS_EVENT.QUEUE_UPDATED);
    expect(queueEvents.length).toBeGreaterThanOrEqual(1);
    const msgEvents = events.filter((e) => e.type === WS_EVENT.MESSAGE);
    expect(msgEvents.some((e) => (e.data as Record<string, unknown>).body === 'queued msg')).toBe(true);
  });

  test('queue_message action queues and emits message + queue_updated', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    orch.isProcessing = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage({ action: WS_ACTION.QUEUE_MESSAGE, text: 'steer this way' });
    expect(events.some((e) => e.type === WS_EVENT.MESSAGE)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.QUEUE_UPDATED && (e.data as Record<string, unknown>).count === 1)).toBe(true);
  });

  test('queue resets when a new streaming session starts', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    
    // Enqueue a message to ensure count > 0 before starting a session
    await orch.handleClientMessage({ action: WS_ACTION.QUEUE_MESSAGE, text: 'go' });
    
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    
    await orch.handleClientMessage({ action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'go' });
    
    // At stream start, queue_updated with count 0 should be emitted
    const queueResetEvent = events.find((e) => e.type === WS_EVENT.QUEUE_UPDATED && e.data.count === 0);
    expect(queueResetEvent).toBeDefined();
  });

  test('sendMessageFromApi returns AGENT_BUSY when isProcessing', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    orch.isProcessing = true;
    const result = await orch.sendMessageFromApi('hello');
    expect(result.accepted).toBe(false);
    expect(result.error).toBe(ERROR_CODE.AGENT_BUSY);
  });

  test('sendMessageFromApi returns accepted and messageId when authenticated', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    const result = await orch.sendMessageFromApi('ping');
    expect(result.accepted).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(typeof result.messageId).toBe('string');
  });

  test('sendMessageFromApi calls checkAndSendAuthStatus first', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = false;
    // Mock strategy checkAuthStatus returns true, so it will authenticate
    const result = await orch.sendMessageFromApi('hello');
    // After checkAndSendAuthStatus, isAuthenticated becomes true
    expect(result.accepted).toBe(true);
    expect(orch.isAuthenticated).toBe(true);
  });

  test('handleClientMessage initiate_auth sends auth_success when already authenticated', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = false;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    // Mock strategy returns true for checkAuthStatus
    await orch.handleClientMessage({ action: WS_ACTION.INITIATE_AUTH });
    const authSuccess = events.find((e) => e.type === WS_EVENT.AUTH_SUCCESS);
    expect(authSuccess).toBeDefined();
    expect(orch.isAuthenticated).toBe(true);
  });

  test('handleClientMessage cancel_auth sets isAuthenticated to false', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage({ action: WS_ACTION.CANCEL_AUTH });
    expect(orch.isAuthenticated).toBe(false);
    const authStatus = events.find((e) => e.type === WS_EVENT.AUTH_STATUS);
    expect(authStatus).toBeDefined();
    expect(authStatus?.data.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
  });

  test('handleClientMessage reauthenticate clears credentials and re-initiates auth', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage({ action: WS_ACTION.REAUTHENTICATE });
    // Mock strategy auto-authenticates via executeAuth callback, but the immediate
    // effect is that auth_status UNAUTHENTICATED is first emitted
    const authStatus = events.find((e) => e.type === WS_EVENT.AUTH_STATUS);
    expect(authStatus).toBeDefined();
    expect(authStatus?.data.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
  });

  test('handleClientMessage logout sets isAuthenticated and isProcessing to false', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    orch.isProcessing = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage({ action: WS_ACTION.LOGOUT });
    expect(orch.isAuthenticated).toBe(false);
    expect(orch.isProcessing).toBe(false);
    const authStatus = events.find((e) => e.type === WS_EVENT.AUTH_STATUS);
    expect(authStatus?.data.isProcessing).toBe(false);
  });

  test('handleClientMessage submit_auth_code passes code to strategy', async () => {
    const orch = await createOrchestrator();
    // Should not throw — mock strategy handles it
    await orch.handleClientMessage({ action: WS_ACTION.SUBMIT_AUTH_CODE, code: 'test-code' });
  });

  test('handleClientMessage submit_story stores story for last assistant', async () => {
    const orch = await createOrchestrator();
    orch.isAuthenticated = true;
    // First send a message to create an activity
    await orch.handleClientMessage({ action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    const story = [
      { id: 's1', type: 'step', message: 'Did something', timestamp: new Date().toISOString() },
    ];
    await orch.handleClientMessage({ action: WS_ACTION.SUBMIT_STORY, story });
    // Should emit activity_updated or activity_appended
    const hasActivityEvent = events.some(
      (e) => e.type === WS_EVENT.ACTIVITY_UPDATED || e.type === WS_EVENT.ACTIVITY_APPENDED
    );
    expect(hasActivityEvent).toBe(true);
  });

  test('handleClientMessage submit_story without prior activity creates new', async () => {
    const orch = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orch.outbound.subscribe((ev) => events.push(ev));
    const story = [
      { id: 's1', type: 'step', message: 'New story', timestamp: new Date().toISOString() },
    ];
    await orch.handleClientMessage({ action: WS_ACTION.SUBMIT_STORY, story });
    const appended = events.find((e) => e.type === WS_EVENT.ACTIVITY_APPENDED);
    expect(appended).toBeDefined();
  });

  test('outbound getter returns the Subject', async () => {
    const orch = await createOrchestrator();
    expect(orch.outbound).toBeDefined();
    expect(typeof orch.outbound.subscribe).toBe('function');
  });

  test('messages getter returns message store', async () => {
    const orch = await createOrchestrator();
    expect(orch.messages).toBeDefined();
    expect(typeof orch.messages.all).toBe('function');
  });

  test('ensureStrategySettings calls strategy.ensureSettings', async () => {
    const orch = await createOrchestrator();
    orch.ensureStrategySettings(); // Should not throw
  });

  test('handleClientMessage unknown action warns but does not throw', async () => {
    const orch = await createOrchestrator();
    await orch.handleClientMessage({ action: 'nonexistent_action' });
  });
});

