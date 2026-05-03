import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Subject } from 'rxjs';
import { OrchestratorService } from './orchestrator.service';
import { SessionContext } from './session-context';
import { SessionRegistryService } from './session-registry.service';
import { ActivityStoreService } from '../activity-store/activity-store.service';
import { MessageStoreService } from '../message-store/message-store.service';
import { ModelStoreService } from '../model-store/model-store.service';
import { EffortStoreService } from '../effort-store/effort-store.service';
import { AgentModeStoreService } from '../agent-mode/agent-mode.store.service';
import { UploadsService } from '../uploads/uploads.service';
import type { GemmaRouterService } from '../gemma-router/gemma-router.service';
import type { LocalMcpService } from '../local-mcp/local-mcp.service';
import { WS_ACTION, WS_EVENT, AUTH_STATUS, ERROR_CODE } from '@shared/ws-constants';
import { AGENT_MODES } from '@shared/agent-mode.constants';

describe('OrchestratorService', () => {
  let dataDir: string;
  let lastActivityStore: ActivityStoreService | undefined;
  const envBackup = process.env.AGENT_PROVIDER;

  beforeEach(() => {
    lastActivityStore = undefined;
    dataDir = mkdtempSync(join(tmpdir(), 'orch-'));
    process.env.AGENT_PROVIDER = 'mock';
  });

  afterEach(async () => {
    if (envBackup === undefined) {
      delete process.env.AGENT_PROVIDER;
    } else {
      process.env.AGENT_PROVIDER = envBackup;
    }
    await lastActivityStore?.flush();
    await new Promise((r) => setTimeout(r, 50));
    rmSync(dataDir, { recursive: true, force: true });
  });

  function makeLocalMcpStub(): { service: LocalMcpService; resolved: Map<string, unknown> } {
    const resolved = new Map<string, unknown>();
    const service = {
      outbound$: new Subject<{ type: string; data: Record<string, unknown> }>(),
      registerModeAccessors: () => undefined,
      resolveQuestion: (id: string, payload: unknown) => { resolved.set(id, payload); },
      getServerScriptPath: () => '/dev/null/local-mcp.server.js',
    } as unknown as LocalMcpService;
    return { service, resolved };
  }

  async function createOrchestrator(localMcp?: LocalMcpService): Promise<{ orch: OrchestratorService; ctx: SessionContext; sessionRegistry: SessionRegistryService }> {
    const config = {
      getDataDir: () => dataDir,
      getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined,
      getSystemPrompt: () => undefined,
      getModelOptions: () => [],
      getDefaultModel: () => '',
      getDefaultEffort: () => 'max',
      isGemmaRouterEnabled: () => false,
      isFibeHydrateEnabled: () => false,
    };
    const activityStore = new ActivityStoreService(config as never);
    lastActivityStore = activityStore;
    const messageStore = new MessageStoreService(config as never);
    const modelStore = new ModelStoreService(config as never);
    const effortStore = new EffortStoreService(config as never);
    const strategyRegistry = { resolveStrategy: () => ({ checkAuthStatus: async () => true, executeAuth: () => undefined, submitAuthCode: () => undefined, cancelAuth: () => undefined, clearCredentials: () => undefined, executeLogout: () => undefined, executePromptStreaming: async (_p: string, _m: string, onChunk: (c: string) => void) => { onChunk('test response'); }, ensureSettings: () => undefined, interruptAgent: () => undefined, hasNativeSessionSupport: () => true, steerAgent: undefined }) } as unknown as import('../strategies/strategy-registry.service').StrategyRegistryService;
    const sessionRegistry = new SessionRegistryService(strategyRegistry as never);
    const uploadsService = new UploadsService(config as never);
    const fibeSync = {
      syncMessages: (getContent: () => string) => { void getContent(); },
      syncActivity: (getContent: () => string) => { void getContent(); },
      hydrate: async () => null,
    } as unknown as import('../fibe-sync/fibe-sync.service').FibeSyncService;
    const chatContext = {
      buildFullPrompt: async (
        text: string,
        _imageUrls: string[],
        _audioFilename: string | null,
        _attachmentFilenames?: string[],
      ) => text.trim(),
      injectToolHint: (text: string) => text,
      injectModeHint: (text: string) => text,
    } as unknown as import('./chat-prompt-context.service').ChatPromptContextService;
    const gemmaRouter = {
      analyze: async () => ({ action: { type: 'DELEGATE_TO_AGENT', tools: [], confidence: 0 }, skipped: true }),
    } as unknown as GemmaRouterService;
    const gemmaMcpTools = {
      refresh: async () => undefined,
      getTools: () => [],
    } as unknown as import('../gemma-router/gemma-mcp-tools.service').GemmaMcpToolsService;
    const agentModeStore = new AgentModeStoreService(config as never);
    const stub = localMcp ?? makeLocalMcpStub().service;
    const orch = new OrchestratorService(
      activityStore,
      messageStore,
      modelStore,
      effortStore,
      config as never,
      sessionRegistry,
      uploadsService,
      fibeSync,
      chatContext,
      gemmaRouter,
      gemmaMcpTools,
      agentModeStore,
      stub,
    );
    await orch.onModuleInit();
    const ctx = sessionRegistry.create();
    ctx.isAuthenticated = false;
    return { orch, ctx, sessionRegistry };
  }

  async function waitForIdle(ctx: SessionContext): Promise<void> {
    for (let i = 0; i < 40; i += 1) {
      if (!ctx.isProcessing) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(ctx.isProcessing).toBe(false);
  }

  test('handleClientConnected sends auth_status, activity_snapshot, and agent_mode_updated', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    orch.handleClientConnected(ctx);
    expect(events.length).toBe(3);
    expect(events[0].type).toBe(WS_EVENT.AUTH_STATUS);
    expect(events[0].data.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
    expect(events[1].type).toBe(WS_EVENT.ACTIVITY_SNAPSHOT);
    expect(events[1].data.activity).toBeDefined();
    expect(events[2].type).toBe(WS_EVENT.AGENT_MODE_UPDATED);
    expect(events[2].data.mode).toBeDefined();
  });

  test('handleClientMessage get_model sends model_updated', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    orch.handleClientMessage(ctx, { action: WS_ACTION.GET_MODEL });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.MODEL_UPDATED);
    expect(events[0].data.model).toBeDefined();
  });

  test('handleClientMessage set_model sends model_updated with value', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SET_MODEL, model: 'gemini-2' });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.MODEL_UPDATED);
    expect(events[0].data.model).toBe('gemini-2');
  });

  test('handleClientMessage get_effort sends effort_updated', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    orch.handleClientMessage(ctx, { action: WS_ACTION.GET_EFFORT });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.EFFORT_UPDATED);
    expect(events[0].data.effort).toBe('max');
  });

  test('handleClientMessage set_effort sends effort_updated with value', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SET_EFFORT, effort: 'high' });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.EFFORT_UPDATED);
    expect(events[0].data.effort).toBe('high');
  });

  test('handleClientMessage send_chat_message without auth sends error NEED_AUTH', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = false; orch.isAuthenticated = false;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });
    expect(events.some((e) => e.type === WS_EVENT.ERROR && e.data.message === 'NEED_AUTH')).toBe(true);
  });

  test('handleClientMessage check_auth_status sends auth_status', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.CHECK_AUTH_STATUS });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.AUTH_STATUS);
  });

  test('handleClientMessage send_chat_message with audioFilename streams response', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    const uploads = new UploadsService({ getDataDir: () => dataDir, getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined, getEncryptionKey: () => undefined } as never);
    const filename = await uploads.saveAudioFromBuffer(Buffer.from('audio'), 'audio/webm');
    const events: Array<{ type: string }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'Hello',
      audioFilename: filename,
    });
    expect(events.some((e) => e.type === WS_EVENT.STREAM_START)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.ERROR)).toBe(false);
  });

  test('handleClientMessage send_chat_message with audio base64 saves and streams', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    const dataUrl = 'data:audio/webm;base64,' + Buffer.from('voice').toString('base64');
    const events: Array<{ type: string }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'Hi',
      audio: dataUrl,
    });
    expect(events.some((e) => e.type === WS_EVENT.STREAM_START)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.ERROR)).toBe(false);
  });

  test('send_chat_message sends stream_start with model and synthetic thinking_step', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });
    const streamStart = events.find((e) => e.type === WS_EVENT.STREAM_START);
    expect(streamStart).toBeDefined();
    expect(streamStart?.data.model).toBeDefined();
    const thinkingStep = events.find((e) => e.type === WS_EVENT.THINKING_STEP);
    expect(thinkingStep).toBeDefined();
    expect(thinkingStep?.data.title).toBe('Generating response');
    expect(thinkingStep?.data.status).toBe('processing');
  });

  test('send_chat_message sends stream_end with model', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });
    const streamEnd = events.find((e) => e.type === WS_EVENT.STREAM_END);
    expect(streamEnd).toBeDefined();
    expect(streamEnd?.data.model).toBeDefined();
    expect(typeof streamEnd?.data.model).toBe('string');
  });

  test('provider authentication failures clear backend auth state and send clear error', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    const message =
      'Authentication failed for Claude Code: the API key or token is invalid. Check the configured Claude Code credentials, then reconnect or re-authenticate.';
    // Override the session's strategy to throw an auth error
    (ctx.strategy as unknown as Record<string, unknown>).executePromptStreaming = async () => {
      throw new Error(message);
    };

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });

    expect(orch.isAuthenticated).toBe(false);
    expect(events.some((e) => e.type === WS_EVENT.ERROR && e.data.message === message)).toBe(true);
  });

  test('handleClientMessage interrupt_agent when not processing does nothing', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: Array<{ type: string }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    orch.handleClientMessage(ctx, { action: WS_ACTION.INTERRUPT_AGENT });
    expect(events.length).toBe(0);
  });

  test('handleClientMessage interrupt_agent when processing sends stream_end with accumulated', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    const events: Array<{ type: string }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    const promise = orch.handleClientMessage(ctx, { action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });
    orch.handleClientMessage(ctx, { action: WS_ACTION.INTERRUPT_AGENT });
    await promise;
    expect(events.some((e) => e.type === WS_EVENT.STREAM_START)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(true);
    expect(ctx.isProcessing).toBe(false);
  });

  test('send_chat_message while processing queues the message instead of blocking', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    const promise = orch.handleClientMessage(ctx, { action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'first' });
    // While processing, send another message — should be queued
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'queued msg' });
    await promise;
    const msgEvents = events.filter((e) => e.type === WS_EVENT.MESSAGE);
    expect(msgEvents.some((e) => (e.data as Record<string, unknown>).body === 'queued msg')).toBe(true);
  });

  test('queue_message action queues and emits message', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    ctx.isProcessing = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.QUEUE_MESSAGE, text: 'steer this way' });
    expect(events.some((e) => e.type === WS_EVENT.MESSAGE)).toBe(true);
  });

  test('sendMessageFromApi returns AGENT_BUSY when isProcessing', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    ctx.isProcessing = true;
    const result = await orch.sendMessageFromApi('hello');
    expect(result.accepted).toBe(false);
    expect(result.error).toBe(ERROR_CODE.AGENT_BUSY);
  });

  test('sendMessageFromApi returns accepted and messageId when authenticated', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    const result = await orch.sendMessageFromApi('ping');
    expect(result.accepted).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(typeof result.messageId).toBe('string');
    await waitForIdle(ctx);
  });

  test('sendMessageFromApi calls checkAndSendAuthStatus first', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = false; orch.isAuthenticated = false;
    // Mock strategy checkAuthStatus returns true, so it will authenticate
    const result = await orch.sendMessageFromApi('hello');
    // After checkAndSendAuthStatus, isAuthenticated becomes true
    expect(result.accepted).toBe(true);
    expect(orch.isAuthenticated).toBe(true);
    await waitForIdle(ctx);
  });

  test('handleClientMessage initiate_auth sends auth_success when already authenticated', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = false; orch.isAuthenticated = false;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    // Mock strategy returns true for checkAuthStatus
    await orch.handleClientMessage(ctx, { action: WS_ACTION.INITIATE_AUTH });
    const authSuccess = events.find((e) => e.type === WS_EVENT.AUTH_SUCCESS);
    expect(authSuccess).toBeDefined();
    expect(orch.isAuthenticated).toBe(true);
  });

  test('handleClientMessage cancel_auth sets isAuthenticated to false', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.CANCEL_AUTH });
    expect(orch.isAuthenticated).toBe(false);
    const authStatus = events.find((e) => e.type === WS_EVENT.AUTH_STATUS);
    expect(authStatus).toBeDefined();
    expect(authStatus?.data.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
  });

  test('handleClientMessage reauthenticate clears credentials and re-initiates auth', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.REAUTHENTICATE });
    // Mock strategy auto-authenticates via executeAuth callback, but the immediate
    // effect is that auth_status UNAUTHENTICATED is first emitted
    const authStatus = events.find((e) => e.type === WS_EVENT.AUTH_STATUS);
    expect(authStatus).toBeDefined();
    expect(authStatus?.data.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
  });

  test('handleClientMessage logout sets isAuthenticated and isProcessing to false', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    ctx.isProcessing = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.LOGOUT });
    expect(orch.isAuthenticated).toBe(false);
    expect(ctx.isProcessing).toBe(false);
    const authStatus = events.find((e) => e.type === WS_EVENT.AUTH_STATUS);
    // Logout broadcasts anyProcessing=false to all sessions
    expect(authStatus?.data.anyProcessing).toBe(false);
  });

  test('handleClientMessage submit_auth_code passes code to strategy', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    // Should not throw — mock strategy handles it
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SUBMIT_AUTH_CODE, code: 'test-code' });
  });

  test('handleClientMessage submit_story stores story for last assistant', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.isAuthenticated = true; orch.isAuthenticated = true;
    // First send a message to create an activity
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hi' });
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    const story = [
      { id: 's1', type: 'step', message: 'Did something', timestamp: new Date().toISOString() },
    ];
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SUBMIT_STORY, story });
    // Should emit activity_updated or activity_appended
    const hasActivityEvent = events.some(
      (e) => e.type === WS_EVENT.ACTIVITY_UPDATED || e.type === WS_EVENT.ACTIVITY_APPENDED
    );
    expect(hasActivityEvent).toBe(true);
  });

  test('handleClientMessage submit_story without prior activity is ignored', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    const story = [
      { id: 's1', type: 'step', message: 'New story', timestamp: new Date().toISOString() },
    ];
    await orch.handleClientMessage(ctx, { action: WS_ACTION.SUBMIT_STORY, story });
    expect(events.some((e) => e.type === WS_EVENT.ACTIVITY_APPENDED)).toBe(false);
    expect(events.some((e) => e.type === WS_EVENT.ACTIVITY_UPDATED)).toBe(false);
  });

  test('outbound stream exists on session context', async () => {
    const { ctx } = await createOrchestrator();
    expect(ctx.outbound$).toBeDefined();
    expect(typeof ctx.outbound$.subscribe).toBe('function');
  });

  test('messages getter returns message store', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    expect(orch.messages).toBeDefined();
    expect(typeof orch.messages.all).toBe('function');
  });

  test('ensureStrategySettings calls strategy.ensureSettings', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    orch.ensureStrategySettings(); // Should not throw
  });

  test('handleClientMessage unknown action warns but does not throw', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    await orch.handleClientMessage(ctx, { action: 'nonexistent_action' });
  });

  test('setAgentMode emits AGENT_MODE_UPDATED event', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: { type: string; data: unknown }[] = [];
    ctx.outbound$.subscribe((e: { type: string; data: unknown }) => events.push(e));

    const result = orch.setAgentMode('exploring');
    expect(result).toBe(AGENT_MODES.exploring);

    const modeEvent = events.find((e) => e.type === WS_EVENT.AGENT_MODE_UPDATED);
    expect(modeEvent).toBeDefined();
    expect((modeEvent?.data as { mode: string })?.mode).toBe(AGENT_MODES.exploring);
  });

  test('setAgentMode with display string is accepted (backwards compat)', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const result = orch.setAgentMode('Casting...');
    expect(result).toBe(AGENT_MODES.casting);
  });

  test('setAgentMode with unknown mode returns null and does not emit', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: { type: string; data: unknown }[] = [];
    ctx.outbound$.subscribe((e: { type: string; data: unknown }) => events.push(e));

    const result = orch.setAgentMode('hacking');
    expect(result).toBeNull();
    expect(events.find((e) => e.type === WS_EVENT.AGENT_MODE_UPDATED)).toBeUndefined();
  });

  test('handleClientConnected sends agent_mode_updated with current mode', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    orch.setAgentMode('casting');

    const events: { type: string; data: unknown }[] = [];
    ctx.outbound$.subscribe((e: { type: string; data: unknown }) => events.push(e));
    await orch.handleClientConnected(ctx);

    const modeEvent = events.find((e) => e.type === WS_EVENT.AGENT_MODE_UPDATED);
    expect(modeEvent).toBeDefined();
    expect((modeEvent?.data as { mode: string })?.mode).toBe(AGENT_MODES.casting);
  });

  // ─── Local MCP tool WS actions ───────────────────────────────────────────

  test('answer_user_question resolves a pending LocalMcp question', async () => {
    const { service: localMcp, resolved } = makeLocalMcpStub();
    const { orch, ctx, sessionRegistry } = await createOrchestrator(localMcp);

    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.ANSWER_USER_QUESTION,
      questionId: 'q-abc',
      answer: 'Paris',
    } as never);

    expect(resolved.get('q-abc')).toEqual({ answer: 'Paris' });
  });

  test('confirm_action_response resolves a pending LocalMcp confirm (confirmed=true)', async () => {
    const { service: localMcp, resolved } = makeLocalMcpStub();
    const { orch, ctx, sessionRegistry } = await createOrchestrator(localMcp);

    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.CONFIRM_ACTION_RESPONSE,
      questionId: 'q-xyz',
      confirmed: true,
    } as never);

    expect(resolved.get('q-xyz')).toEqual({ confirmed: true });
  });

  test('confirm_action_response with confirmed=false passes false', async () => {
    const { service: localMcp, resolved } = makeLocalMcpStub();
    const { orch, ctx, sessionRegistry } = await createOrchestrator(localMcp);

    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.CONFIRM_ACTION_RESPONSE,
      questionId: 'q-no',
      confirmed: false,
    } as never);

    expect(resolved.get('q-no')).toEqual({ confirmed: false });
  });

  test('LocalMcp outbound$ events are forwarded to orchestrator outbound', async () => {
    const { service: localMcp } = makeLocalMcpStub();
    const { orch, ctx, sessionRegistry } = await createOrchestrator(localMcp);

    const events: { type: string; data: unknown }[] = [];
    ctx.outbound$.subscribe((e) => events.push(e));

    // Emit a synthetic ask_user_prompt event from the localMcp stub
    (localMcp as unknown as { outbound$: Subject<{ type: string; data: Record<string, unknown> }> })
      .outbound$.next({ type: 'ask_user_prompt', data: { questionId: 'q1', question: 'Name?' } });

    const fwdEvent = events.find((e) => e.type === 'ask_user_prompt');
    expect(fwdEvent).toBeDefined();
    expect((fwdEvent?.data as Record<string, unknown>)['questionId']).toBe('q1');
  });

  test('send_chat_message with EXECUTE_CLI from GemmaRouter short-circuits to CLI execution', async () => {
    const { service: localMcp } = makeLocalMcpStub();
    const { orch, ctx, sessionRegistry } = await createOrchestrator(localMcp);
    ctx.isAuthenticated = true; orch.isAuthenticated = true;

    // Force gemmaRouter to return an EXECUTE_CLI action
    const configSpy = spyOn(orch['config'], 'isGemmaRouterEnabled').mockReturnValue(true);
    orch['gemmaMcpTools'].getTools = () => [{ name: 'fibe', description: 'desc' }];
    orch['gemmaRouter'].analyze = async () => ({
      skipped: false,
      action: { type: 'EXECUTE_CLI', command: 'echo hello_from_cli' },
    });

    const events: { type: string; data: Record<string, unknown> }[] = [];
    ctx.outbound$.subscribe((e) => events.push(e as { type: string; data: Record<string, unknown> }));

    await orch.handleClientMessage(ctx, { action: WS_ACTION.SEND_CHAT_MESSAGE, text: 'hello CLI' });

    expect(events.some((e) => e.type === WS_EVENT.STREAM_START && e.data.model === 'CLI Router')).toBe(true);
    const chunkEvents = events.filter((e) => e.type === WS_EVENT.STREAM_CHUNK);
    expect(chunkEvents.length).toBeGreaterThan(0);
    const allChunks = chunkEvents.map((e) => String(e.data.text)).join('');
    expect(allChunks).toContain('hello_from_cli');
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(true);
    
    configSpy.mockRestore();
  });
});
