import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Subject } from 'rxjs';
import { OrchestratorService } from './orchestrator.service';
import { AgentController } from '../agent/agent.controller';
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
import {
  WS_ACTION,
  WS_EVENT,
  AUTH_STATUS,
  ERROR_CODE,
} from '@shared/ws-constants';
import { AGENT_MODES } from '@shared/agent-mode.constants';
import { INTERRUPTED_MESSAGE } from '../strategies/strategy.types';

describe('OrchestratorService', () => {
  let dataDir: string;
  let lastActivityStore: ActivityStoreService | undefined;
  let fixtures: Array<{ dispose: () => Promise<void> }>;
  const envBackup = process.env.AGENT_PROVIDER;

  beforeEach(() => {
    lastActivityStore = undefined;
    fixtures = [];
    dataDir = mkdtempSync(join(tmpdir(), 'orch-'));
    process.env.AGENT_PROVIDER = 'mock';
  });

  afterEach(async () => {
    // A timed-out hook may resume after the next fixture starts: keep ownership
    // of this directory and never delete or reconfigure the following fixture.
    const fixtureDir = dataDir;
    const ownedFixtures = fixtures;
    await Promise.all(ownedFixtures.map((fixture) => fixture.dispose()));
    rmSync(fixtureDir, { recursive: true, force: true });
    if (dataDir === fixtureDir) {
      if (envBackup === undefined) delete process.env.AGENT_PROVIDER;
      else process.env.AGENT_PROVIDER = envBackup;
    }
  });

  function trackBackgroundTasks(orch: OrchestratorService): () => Promise<void> {
    const tasks = new Set<Promise<void>>();
    const background = orch as unknown as Record<
      'runAgentResponse' | 'drainQueuedTurns' | 'recoverPendingApiRequests',
      (...args: unknown[]) => Promise<void>
    >;
    for (const method of ['runAgentResponse', 'drainQueuedTurns', 'recoverPendingApiRequests'] as const) {
      const original = background[method].bind(orch);
      spyOn(background, method).mockImplementation((...args) => {
        const task = original(...args);
        tasks.add(task);
        void task.then(() => tasks.delete(task), () => tasks.delete(task));
        return task;
      });
    }
    return async () => {
      // Response settlement can schedule another queue/recovery task.
      do {
        await Promise.allSettled([...tasks]);
        await Promise.resolve();
      } while (tasks.size);
    };
  }

  function makeLocalMcpStub(): {
    service: LocalMcpService;
    resolved: Map<string, unknown>;
  } {
    const resolved = new Map<string, unknown>();
    const service = {
      outbound$: new Subject<{ type: string; data: Record<string, unknown> }>(),
      registerModeAccessors: () => undefined,
      resolveQuestion: (id: string, payload: unknown) => {
        resolved.set(id, payload);
      },
      getServerLaunch: () => ({
        command: process.execPath,
        args: ['/dev/null/local-mcp.server.js'],
        env: { PORT: '3000' },
      }),
      getServerScriptPath: () => '/dev/null/local-mcp.server.js',
    } as unknown as LocalMcpService;
    return { service, resolved };
  }

  type CreateOrchestratorOptions = {
    systemPrompt?: string;
    cachedSystemPromptFromFile?: string | null;
    nativeSessionSupport?: boolean;
    injectPromptHistory?: boolean;
    beforeStrategyResponse?: () => Promise<void>;
  };

  async function createOrchestrator(
    localMcp?: LocalMcpService,
    options: CreateOrchestratorOptions = {},
  ): Promise<{
    orch: OrchestratorService;
    ctx: SessionContext;
    sessionRegistry: SessionRegistryService;
    promptBuilds: Array<{
      text: string;
      imageUrls: string[];
      audioFilename: string | null;
      attachmentFilenames?: string[];
      historyMessages?: Array<{ role: string; body: string }>;
    }>;
    strategyCalls: Array<{
      prompt: string;
      model: string;
      systemPrompt?: string;
      effort?: string;
    }>;
    syncActivityContents: string[];
    messageStore: MessageStoreService;
    waitForBackgroundTasks: () => Promise<void>;
    dispose: () => Promise<void>;
  }> {
    const fixtureDir = dataDir;
    const config = {
      getDataDir: () => fixtureDir,
      getConversationDataDir: () => fixtureDir,
      getEncryptionKey: () => undefined,
      getSystemPrompt: () => options.systemPrompt,
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
    const conversationManager = {
      get: (_id: string) => ({ messageStore, activityStore }),
      getOrCreate: (_id: string) => ({ messageStore, activityStore }),
      dataDirProvider: (_id: string) => ({
        getConversationDataDir: () => fixtureDir,
      }),
      touch: (_id: string) => undefined,
      list: () => [],
      create: () => ({
        id: 'test',
        title: 'New chat',
        createdAt: '',
        lastMessageAt: '',
      }),
      setTitle: () => true,
      delete: () => true,
      getClaudeSessionMarker: (_id: string) => null,
      setClaudeSessionMarker: (_id: string, _sessionId: string | null) => true,
    } as unknown as import('../conversation/conversation-manager.service').ConversationManagerService;
    const strategyCalls: Array<{
      prompt: string;
      model: string;
      systemPrompt?: string;
      effort?: string;
    }> = [];
    const strategy = {
      checkAuthStatus: async () => true,
      executeAuth: () => undefined,
      submitAuthCode: () => undefined,
      cancelAuth: () => undefined,
      clearCredentials: () => undefined,
      executeLogout: () => undefined,
      executePromptStreaming: async (
        prompt: string,
        model: string,
        onChunk: (c: string) => void,
        _callbacks?: unknown,
        systemPrompt?: string,
        runtimeOptions?: { effort?: string },
      ) => {
        strategyCalls.push({
          prompt,
          model,
          systemPrompt,
          effort: runtimeOptions?.effort,
        });
        await options.beforeStrategyResponse?.();
        onChunk('test response');
      },
      ensureSettings: () => undefined,
      interruptAgent: () => undefined,
      hasNativeSessionSupport: () => options.nativeSessionSupport ?? true,
      ...(options.injectPromptHistory !== undefined
        ? { shouldInjectPromptHistory: () => options.injectPromptHistory }
        : {}),
      steerAgent: undefined,
    };
    const strategyRegistry = {
      resolveStrategy: () => strategy,
    } as unknown as import('../strategies/strategy-registry.service').StrategyRegistryService;
    const sessionRegistry = new SessionRegistryService(
      strategyRegistry as never,
      conversationManager,
    );
    const uploadsService = new UploadsService(config as never);
    const syncMessageContents: string[] = [];
    const syncActivityContents: string[] = [];
    const fibeSync = {
      syncMessages: (getContent: () => string) => {
        syncMessageContents.push(getContent());
      },
      syncActivity: (getContent: () => string) => {
        syncActivityContents.push(getContent());
      },
      hydrate: async () => null,
    } as unknown as import('../fibe-sync/fibe-sync.service').FibeSyncService;
    const promptBuilds: Array<{
      text: string;
      imageUrls: string[];
      audioFilename: string | null;
      attachmentFilenames?: string[];
      historyMessages?: Array<{ role: string; body: string }>;
    }> = [];
    const chatContext = {
      buildFullPrompt: async (
        text: string,
        imageUrls: string[],
        audioFilename: string | null,
        attachmentFilenames?: string[],
        historyMessages?: Array<{ role: string; body: string }>,
      ) => {
        promptBuilds.push({
          text,
          imageUrls,
          audioFilename,
          attachmentFilenames,
          historyMessages,
        });
        return text.trim();
      },
      injectToolHint: (text: string) => text,
      injectModeHint: (text: string) => text,
    } as unknown as import('./chat-prompt-context.service').ChatPromptContextService;
    const gemmaRouter = {
      analyze: async () => ({
        action: { type: 'DELEGATE_TO_AGENT', tools: [], confidence: 0 },
        skipped: true,
      }),
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
      conversationManager,
    );
    const waitForBackgroundTasks = trackBackgroundTasks(orch);
    const dispose = async () => {
      await waitForBackgroundTasks();
      await Promise.all([messageStore, activityStore, modelStore, effortStore, agentModeStore]
        .map((store) => store.onModuleDestroy()));
    };
    fixtures.push({ dispose });
    await orch.onModuleInit();
    const ctx = sessionRegistry.create();
    if (options.cachedSystemPromptFromFile !== undefined) {
      ctx.cachedSystemPromptFromFile = options.cachedSystemPromptFromFile;
    }
    ctx.isAuthenticated = false;
    return {
      orch,
      ctx,
      sessionRegistry,
      promptBuilds,
      strategyCalls,
      syncMessageContents,
      syncActivityContents,
      messageStore,
      waitForBackgroundTasks,
      dispose,
    };
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  async function waitForIdle(ctx: SessionContext): Promise<void> {
    for (let i = 0; i < 40; i += 1) {
      if (!ctx.isProcessing) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(ctx.isProcessing).toBe(false);
  }

  test('handleClientConnected sends auth_status, activity_snapshot, and agent_mode_updated', async () => {
    const { orch, ctx } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    orch.handleClientConnected(ctx);
    expect(events.length).toBe(5);
    expect(events[0].type).toBe(WS_EVENT.AUTH_STATUS);
    expect(events[0].data.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
    expect(events[1].type).toBe(WS_EVENT.ACTIVITY_SNAPSHOT);
    expect(events[1].data.activity).toBeDefined();
    expect(events[2].type).toBe(WS_EVENT.AGENT_MODE_UPDATED);
    expect(events[2].data.mode).toBeDefined();
    expect(events[3].type).toBe(WS_EVENT.MODEL_UPDATED);
    expect(events[4].type).toBe(WS_EVENT.EFFORT_UPDATED);
  });

  test('handleClientConnected includes the active turn start time', async () => {
    const { orch, ctx } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.isProcessing = true;
    ctx.streamStartedAt = '2026-06-15T06:26:11.125Z';
    ctx.outbound$.subscribe((ev) => events.push(ev));

    orch.handleClientConnected(ctx);

    expect(events[0].type).toBe(WS_EVENT.AUTH_STATUS);
    expect(events[0].data.isProcessing).toBe(true);
    expect(events[0].data.startedAt).toBe('2026-06-15T06:26:11.125Z');
  });

  test('handleClientMessage get_model sends model_updated', async () => {
    const { orch, ctx } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    orch.handleClientMessage(ctx, { action: WS_ACTION.GET_MODEL });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.MODEL_UPDATED);
    expect(events[0].data.model).toBeDefined();
  });

  test('handleClientMessage set_model sends model_updated with value', async () => {
    const { orch, ctx } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SET_MODEL,
      model: 'gemini-2',
    });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.MODEL_UPDATED);
    expect(events[0].data.model).toBe('gemini-2');
  });

  test('handleClientMessage get_effort sends effort_updated', async () => {
    const { orch, ctx } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    orch.handleClientMessage(ctx, { action: WS_ACTION.GET_EFFORT });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.EFFORT_UPDATED);
    expect(events[0].data.effort).toBe('max');
  });

  test('handleClientMessage set_effort sends effort_updated with value', async () => {
    const { orch, ctx } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SET_EFFORT,
      effort: 'high',
    });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.EFFORT_UPDATED);
    expect(events[0].data.effort).toBe('high');
  });

  test('handleClientMessage send_chat_message without auth sends error NEED_AUTH', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = false;
    orch.isAuthenticated = false;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'hi',
    });
    expect(
      events.some(
        (e) => e.type === WS_EVENT.ERROR && e.data.message === 'NEED_AUTH',
      ),
    ).toBe(true);
  });

  test('handleClientMessage check_auth_status sends auth_status', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const second = sessionRegistry.create('thread-b');
    const secondEvents: Array<{ type: string; data: Record<string, unknown> }> =
      [];
    ctx.isProcessing = true;
    ctx.outbound$.subscribe((ev) => events.push(ev));
    second.outbound$.subscribe((ev) => secondEvents.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.CHECK_AUTH_STATUS,
    });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(WS_EVENT.AUTH_STATUS);
    expect(events[0].data.isProcessing).toBe(true);
    expect(events[0].data.anyProcessing).toBe(true);
    expect(events[0].data.startedAt).toBeNull();
    expect(secondEvents).toHaveLength(1);
    expect(secondEvents[0].data.isProcessing).toBe(false);
    expect(secondEvents[0].data.anyProcessing).toBe(true);
    expect(secondEvents[0].data.startedAt).toBeNull();
  });

  test('handleClientMessage send_chat_message with audioFilename streams response', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const uploads = new UploadsService({
      getDataDir: () => dataDir,
      getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined,
      getEncryptionKey: () => undefined,
    } as never);
    const filename = await uploads.saveAudioFromBuffer(
      Buffer.from('audio'),
      'audio/webm',
    );
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
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const dataUrl =
      'data:audio/webm;base64,' + Buffer.from('voice').toString('base64');
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
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'hi',
    });
    const streamStart = events.find((e) => e.type === WS_EVENT.STREAM_START);
    expect(streamStart).toBeDefined();
    expect(streamStart?.data.model).toBeDefined();
    expect(typeof streamStart?.data.startedAt).toBe('string');
    expect(Number.isNaN(Date.parse(String(streamStart?.data.startedAt)))).toBe(
      false,
    );
    const thinkingStep = events.find((e) => e.type === WS_EVENT.THINKING_STEP);
    expect(thinkingStep).toBeDefined();
    expect(thinkingStep?.data.title).toBe('Generating response');
    expect(thinkingStep?.data.status).toBe('processing');
  });

  test('send_chat_message sends stream_end with model', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'hi',
    });
    const streamEnd = events.find((e) => e.type === WS_EVENT.STREAM_END);
    expect(streamEnd).toBeDefined();
    expect(streamEnd?.data.model).toBeDefined();
    expect(typeof streamEnd?.data.model).toBe('string');
  });

  test('provider authentication failures clear backend auth state and send clear error', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const message =
      'Authentication failed for Claude Code: the API key or token is invalid. Check the configured Claude Code credentials, then reconnect or re-authenticate.';
    (
      ctx.strategy as unknown as Record<string, unknown>
    ).executePromptStreaming = async () => {
      throw new Error(message);
    };

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'hi',
    });

    expect(orch.isAuthenticated).toBe(false);
    expect(
      events.some(
        (e) => e.type === WS_EVENT.ERROR && e.data.message === message,
      ),
    ).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(false);
    expect(
      events.some(
        (e) =>
          e.type === WS_EVENT.THINKING_STEP &&
          e.data.status === 'complete' &&
          e.data.details === message,
      ),
    ).toBe(true);
  });

  test('provider turn failures persist error activity for sync', async () => {
    const { orch, ctx, syncActivityContents } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const message =
      'OpenCode provider quota/rate limit exhausted for provider=google model=gemini-2.5-flash-lite session=ses_test (RESOURCE_EXHAUSTED).';
    spyOn(ctx.strategy, 'executePromptStreaming').mockImplementation(
      async () => {
        throw new Error(message);
      },
    );

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'hi',
    });

    const activities = lastActivityStore?.all() ?? [];
    const errorEntry = activities
      .flatMap((activity) => activity.story)
      .find((entry) => entry.type === 'error');
    expect(errorEntry?.message).toBe('Provider turn failed');
    expect(errorEntry?.details).toBe(message);
    expect(ctx.lastError).toBe(message);
    expect(orch.lastError).toBe(message);
    expect(events.some((e) => e.type === WS_EVENT.ACTIVITY_UPDATED)).toBe(true);
    expect(syncActivityContents.at(-1)).toContain('RESOURCE_EXHAUSTED');
    expect(orch.messages.all().filter((m) => m.role === 'assistant')).toEqual(
      [],
    );
  });

  test('handleClientMessage interrupt_agent when not processing returns a control failure', async () => {
    const { orch, ctx } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.INTERRUPT_AGENT });
    expect(
      events.some(
        (e) => e.type === WS_EVENT.CONTROL_RESULT && e.data.accepted === false,
      ),
    ).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.ERROR)).toBe(true);
  });

  test('handleClientMessage interrupt_agent when processing sends stream_end with accumulated', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const events: Array<{ type: string }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    const promise = orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'hi',
    });
    await orch.handleClientMessage(ctx, { action: WS_ACTION.INTERRUPT_AGENT });
    await promise;
    expect(events.some((e) => e.type === WS_EVENT.CONTROL_RESULT)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.STREAM_START)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(true);
    expect(ctx.isProcessing).toBe(false);
  });

  test('interrupted run without accumulated output does not store no-output assistant', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    spyOn(ctx.strategy, 'executePromptStreaming').mockImplementation(
      async () => {
        throw new Error(INTERRUPTED_MESSAGE);
      },
    );
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));

    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'hi',
    });

    expect(events.some((e) => e.type === WS_EVENT.STREAM_START)).toBe(true);
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(false);
    expect(
      events.some(
        (e) =>
          e.type === WS_EVENT.ERROR &&
          e.data.message === 'Interrupted before producing output.',
      ),
    ).toBe(true);
    expect(orch.messages.all().filter((m) => m.role === 'assistant')).toEqual(
      [],
    );
  });

  test('steer restart suppresses empty interrupt error and immediately drains steer turn', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    let releaseFirst: (() => void) | undefined;
    let calls = 0;
    spyOn(ctx.strategy, 'executePromptStreaming').mockImplementation(
      async (_prompt, _model, onChunk) => {
        calls += 1;
        if (calls === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
          throw new Error(INTERRUPTED_MESSAGE);
        }
        onChunk('steered response');
      },
    );
    (ctx.strategy as unknown as { steerAgent: () => 'queued' }).steerAgent =
      () => 'queued';
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));

    const first = orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'first',
    });
    while (calls < 1) await new Promise((resolve) => setTimeout(resolve, 1));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.STEER_MESSAGE,
      text: 'change course',
    });
    releaseFirst?.();
    await first;

    expect(
      events.some(
        (e) =>
          e.type === WS_EVENT.ERROR &&
          e.data.message === 'Interrupted before producing output.',
      ),
    ).toBe(false);
    expect(calls).toBe(2);
    expect(
      orch.messages
        .all()
        .some((m) => m.role === 'assistant' && m.body === 'steered response'),
    ).toBe(true);
  });

  test('send_chat_message while processing queues the message instead of blocking', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    const promise = orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'first',
    });
    // While processing, send another message: should be queued
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'queued msg',
    });
    await promise;
    const msgEvents = events.filter((e) => e.type === WS_EVENT.MESSAGE);
    expect(
      msgEvents.some(
        (e) => (e.data as Record<string, unknown>).body === 'queued msg',
      ),
    ).toBe(true);
  });

  test('queue_message action queues and emits message', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    ctx.isProcessing = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.QUEUE_MESSAGE,
      text: 'steer this way',
    });
    expect(events.some((e) => e.type === WS_EVENT.MESSAGE)).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === WS_EVENT.CONTROL_RESULT &&
          e.data.accepted === true &&
          e.data.action === 'queue',
      ),
    ).toBe(true);
  });

  test('queue_message on the wrong conversation returns a clear control failure', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.conversationId = 'project-a';
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    ctx.isProcessing = true;
    const requester = sessionRegistry.create('project-b');
    requester.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    requester.outbound$.subscribe((ev) => events.push(ev));

    await orch.handleClientMessage(requester, {
      action: WS_ACTION.QUEUE_MESSAGE,
      text: 'wrong place',
    });

    expect(ctx.queuedTurns).toHaveLength(0);
    expect(
      events.some(
        (e) =>
          e.type === WS_EVENT.CONTROL_RESULT &&
          e.data.accepted === false &&
          String(e.data.reason).includes('project-b'),
      ),
    ).toBe(true);
  });

  test('sendMessageFromApi returns AGENT_BUSY when isProcessing', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    ctx.isProcessing = true;
    const result = await orch.sendMessageFromApi('hello', 'default');
    expect(result.accepted).toBe(false);
    expect(result.error).toBe(ERROR_CODE.AGENT_BUSY);
  });

  test('caller identity replays response loss without repeating a message or provider turn', async () => {
    const { orch, messageStore, strategyCalls, waitForBackgroundTasks } = await createOrchestrator();
    const requestId = 'a514ad73-8519-42e4-b268-ce7e141cb9e9';
    const first = await orch.sendMessageFromApi('one occurrence', 'default', undefined, undefined, 'queue', requestId, messageStore.deliveryGeneration());
    const replay = await orch.sendMessageFromApi('one occurrence', 'default', undefined, undefined, 'queue', requestId, messageStore.deliveryGeneration());
    expect(first.accepted).toBe(true);
    expect(first.messageId).toBe(requestId);
    expect(replay.messageId).toBe(first.messageId);
    await waitForBackgroundTasks();
    expect(messageStore.all().filter((message) => message.role === 'user')).toHaveLength(1);
    expect(strategyCalls).toHaveLength(1);
    const mismatch = await orch.sendMessageFromApi('different occurrence', 'default', undefined, undefined, 'queue', requestId, messageStore.deliveryGeneration());
    expect(mismatch).toMatchObject({ accepted: false, error: 'REQUEST_ID_CONFLICT' });
    // A restored record can retain its old generation under a fresh scope. A
    // changed target is still a content conflict, not an equal uncertain replay.
    writeFileSync(join(dataDir, 'message-store-generation.json'), JSON.stringify({ generation: '7514ad73-8519-42e4-b268-ce7e141cb9e9' }));
    const targetMismatch = await orch.sendMessageFromApi('one occurrence', 'project-b', undefined, undefined, 'queue', requestId, messageStore.deliveryGeneration());
    expect(targetMismatch).toMatchObject({ accepted: false, error: 'REQUEST_ID_CONFLICT' });
  });

  test('response loss followed by history reset refuses the old generation without recreating the turn', async () => {
    const { orch, ctx, messageStore, strategyCalls } = await createOrchestrator();
    ctx.isProcessing = true;
    ctx.isAuthenticated = true;
    const id = '1514ad73-8519-42e4-b268-ce7e141cb9e9';
    const generation = messageStore.deliveryGeneration();
    expect((await orch.sendMessageFromApi('queued occurrence', 'default', undefined, undefined, 'queue', id, generation)).accepted).toBe(true);
    messageStore.reset();
    const replay = await orch.sendMessageFromApi('queued occurrence', 'default', undefined, undefined, 'queue', id, generation);
    expect(replay).toMatchObject({ accepted: false, messageId: id, error: 'STORE_GENERATION_CHANGED' });
    expect(messageStore.all()).toEqual([]);
    expect(strategyCalls).toHaveLength(0);
  });

  test('reset during awaited preparation refuses admission and every provider effect', async () => {
    const { orch, messageStore, strategyCalls } = await createOrchestrator();
    const generation = messageStore.deliveryGeneration();
    const flush = messageStore.flush.bind(messageStore);
    const resetDuringFlush = spyOn(messageStore, 'flush').mockImplementationOnce(async (strict) => {
      messageStore.reset();
      return flush(strict);
    });
    try {
      const result = await orch.sendMessageFromApi('prepared occurrence', 'default', undefined, undefined, 'queue', '2514ad73-8519-42e4-b268-ce7e141cb9e9', generation);
      expect(result).toMatchObject({ accepted: false, error: 'STORE_GENERATION_CHANGED' });
      expect(strategyCalls).toHaveLength(0);
      expect(messageStore.all()).toEqual([]);
    } finally { resetDuringFlush.mockRestore(); }
  });

  test('reset during the strict running checkpoint prevents an accepted pending turn from executing', async () => {
    const { orch, messageStore, strategyCalls, waitForBackgroundTasks } = await createOrchestrator();
    const generation = messageStore.deliveryGeneration();
    const flush = messageStore.flush.bind(messageStore);
    let checkpoints = 0;
    const resetDuringRunning = spyOn(messageStore, 'flush').mockImplementation(async (strict) => {
      if (++checkpoints === 2) messageStore.reset();
      return flush(strict);
    });
    try {
      await orch.sendMessageFromApi('accepted pending', 'default', undefined, undefined, 'queue', '3514ad73-8519-42e4-b268-ce7e141cb9e9', generation);
      await waitForBackgroundTasks();
      expect(checkpoints).toBeGreaterThanOrEqual(2);
      expect(strategyCalls).toHaveLength(0);
      expect(messageStore.all()).toEqual([]);
    } finally { resetDuringRunning.mockRestore(); }
  });

  test('reset during asynchronous prompt preparation after the running checkpoint prevents the provider effect', async () => {
    const { orch, messageStore, strategyCalls, waitForBackgroundTasks } = await createOrchestrator();
    const generation = messageStore.deliveryGeneration();
    const context = (orch as unknown as { chatPromptContext: { buildFullPrompt: (...args: unknown[]) => Promise<string> } }).chatPromptContext;
    const resetDuringPrompt = spyOn(context, 'buildFullPrompt').mockImplementationOnce(async () => {
      expect(messageStore.all().find((message) => message.apiRequest)?.apiRequest?.state).toBe('running');
      messageStore.reset();
      await messageStore.flush(true);
      return 'prepared after reset';
    });
    try {
      await orch.sendMessageFromApi('prompt preparation', 'default', undefined, undefined, 'queue', '6514ad73-8519-42e4-b268-ce7e141cb9e9', generation);
      await waitForBackgroundTasks();
      expect(resetDuringPrompt).toHaveBeenCalledTimes(1);
      expect(strategyCalls).toHaveLength(0);
      expect(messageStore.all().filter((message) => message.role === 'user')).toEqual([]);
    } finally { resetDuringPrompt.mockRestore(); }
  });

  test('explicit delivery scope pins one target, accepts an idle explicit target, and rejects ambiguous active routing', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    expect(orch.resolveDeliveryScope('default')).toMatchObject({ accepted: true, conversationId: 'default' });
    ctx.isProcessing = true;
    expect(orch.resolveDeliveryScope()).toMatchObject({ accepted: true, conversationId: 'default' });
    sessionRegistry.create('project-b').isProcessing = true;
    expect(orch.resolveDeliveryScope()).toMatchObject({ accepted: false });
    expect(orch.resolveDeliveryScope('default')).toMatchObject({ accepted: true, conversationId: 'default' });
  });

  test('ordinary GET status leaves storage untouched; only explicit scope status persists a generation', async () => {
    const { orch } = await createOrchestrator();
    const controller = new AgentController(orch);
    const ordinary = controller.getStatus();
    expect(ordinary).not.toHaveProperty('deliveryScope');
    expect(existsSync(join(dataDir, 'message-store-generation.json'))).toBe(false);
    const explicit = controller.getStatus('true', 'default');
    expect(explicit.deliveryScope).toMatchObject({ accepted: true, conversationId: 'default' });
    expect(existsSync(join(dataDir, 'message-store-generation.json'))).toBe(true);
    expect(controller.getStatus()).toEqual(ordinary);
  });

  test('restart recovers persisted pending queued identities in order without creating duplicate messages', async () => {
    const first = await createOrchestrator();
    first.ctx.isProcessing = true;
    first.ctx.isAuthenticated = true;
    const ids = ['b514ad73-8519-42e4-b268-ce7e141cb9e9', 'c514ad73-8519-42e4-b268-ce7e141cb9e9'];
    for (const [index, id] of ids.entries()) {
      await first.orch.sendMessageFromApi(`queued ${index}`, 'default', undefined, undefined, 'queue', id, first.messageStore.deliveryGeneration());
    }
    first.orch.reorderQueuedTurnsFromApi('default', first.ctx.queuedTurns.map((turn) => turn.id).reverse());
    expect(first.strategyCalls).toHaveLength(0);
    await first.dispose();
    const responseStarted = deferred<void>();
    const providerResponse = deferred<void>();
    const restarted = await createOrchestrator(undefined, {
      beforeStrategyResponse: () => {
        responseStarted.resolve();
        return providerResponse.promise;
      },
    });
    try {
      await responseStarted.promise;
      expect(restarted.strategyCalls.map((call) => call.prompt)).toEqual(['queued 1']);
      expect(restarted.messageStore.getById(ids[1])?.apiRequest?.state).toBe('running');
      expect(restarted.messageStore.getById(ids[0])?.apiRequest?.state).toBe('pending');
    } finally { providerResponse.resolve(); }
    await restarted.waitForBackgroundTasks();
    expect(restarted.strategyCalls.map((call) => call.prompt)).toEqual(['queued 1', 'queued 0']);
    expect(restarted.messageStore.all().filter((message) => message.role === 'user').map((message) => message.id)).toEqual(ids);
    expect(restarted.messageStore.getById(ids[0])?.apiRequest?.state).toBe('completed');
    expect(restarted.messageStore.getById(ids[1])?.apiRequest?.state).toBe('completed');
  });

  test('restart exposes interrupted running identity as unknown and never repeats its provider effect', async () => {
    const first = await createOrchestrator();
    const id = 'd514ad73-8519-42e4-b268-ce7e141cb9e9';
    first.ctx.isProcessing = true;
    first.ctx.isAuthenticated = true;
    await first.orch.sendMessageFromApi('interrupted', 'default', undefined, undefined, 'queue', id, first.messageStore.deliveryGeneration());
    await first.messageStore.updateRequestState(id, 'running');
    await first.dispose();
    const restarted = await createOrchestrator();
    const replay = await restarted.orch.sendMessageFromApi('interrupted', 'default', undefined, undefined, 'queue', id, restarted.messageStore.deliveryGeneration());
    expect(replay).toMatchObject({ accepted: false, messageId: id, error: 'REQUEST_OUTCOME_UNKNOWN', executionState: 'outcome_unknown' });
    expect(restarted.strategyCalls).toHaveLength(0);
    expect(restarted.messageStore.all().filter((message) => message.role === 'user')).toHaveLength(1);
  });

  test('fixture disposal joins delayed provider settlement and every store before directory cleanup', async () => {
    const started = deferred<void>();
    const response = deferred<void>();
    const fixture = await createOrchestrator(undefined, {
      beforeStrategyResponse: () => {
        started.resolve();
        return response.promise;
      },
    });
    const id = '8514ad73-8519-42e4-b268-ce7e141cb9e9';
    await fixture.orch.sendMessageFromApi('slow fixture response', 'default', undefined, undefined, 'queue', id, fixture.messageStore.deliveryGeneration());
    await started.promise;
    fixture.orch.setAgentMode('casting');
    let disposed = false;
    const disposal = fixture.dispose().then(() => { disposed = true; });
    try {
      await Promise.resolve();
      expect(disposed).toBe(false);
      expect(existsSync(dataDir)).toBe(true);
      expect(fixture.messageStore.getById(id)?.apiRequest?.state).toBe('running');
    } finally { response.resolve(); }
    await disposal;
    const persisted = JSON.parse(readFileSync(join(dataDir, 'messages.json'), 'utf8'));
    expect(persisted.find((message: { id: string }) => message.id === id).apiRequest.state).toBe('completed');
    expect(JSON.parse(readFileSync(join(dataDir, 'mode.json'), 'utf8'))).toEqual({ mode: AGENT_MODES.casting });
  });

  test('caller admission prevents provider effects when the real message directory is unavailable', async () => {
    const { orch, ctx, messageStore, strategyCalls } = await createOrchestrator();
    const moved = `${dataDir}-unavailable`;
    const generation = messageStore.deliveryGeneration();
    const flush = messageStore.flush.bind(messageStore);
    const flushSpy = spyOn(messageStore, 'flush').mockImplementationOnce(async (strict) => {
      renameSync(dataDir, moved);
      return flush(strict);
    });
    try {
      await expect(orch.sendMessageFromApi('must persist first', 'default', undefined, undefined, 'queue',
        'e514ad73-8519-42e4-b268-ce7e141cb9e9', generation)).rejects.toThrow();
      expect(strategyCalls).toHaveLength(0);
      expect(ctx.isProcessing).toBe(false);
      expect(messageStore.all().filter((message) => message.role === 'user')).toHaveLength(0);
    } finally {
      flushSpy.mockRestore();
      renameSync(moved, dataDir);
      await messageStore.flush();
    }
  });

  test('simultaneous equal caller identities admit once, and queue edits remain recoverable after restart', async () => {
    const first = await createOrchestrator();
    first.ctx.isProcessing = true;
    first.ctx.isAuthenticated = true;
    const id = 'f514ad73-8519-42e4-b268-ce7e141cb9e9';
    const results = await Promise.all([1, 2].map(() => first.orch.sendMessageFromApi('original', 'default', undefined, undefined, 'queue', id, first.messageStore.deliveryGeneration())));
    expect(results.map((result) => result.messageId)).toEqual([id, id]);
    expect(first.ctx.queuedTurns).toHaveLength(1);
    await first.orch.updateQueuedTurnFromApi('default', first.ctx.queuedTurns[0].id, { text: 'operator edited' });
    await first.dispose();
    const restarted = await createOrchestrator();
    await restarted.waitForBackgroundTasks();
    expect(restarted.strategyCalls.map((call) => call.prompt)).toEqual(['operator edited']);
    expect(restarted.messageStore.all().filter((message) => message.role === 'user')).toHaveLength(1);
    const replay = await restarted.orch.sendMessageFromApi('original', 'default', undefined, undefined, 'queue', id, restarted.messageStore.deliveryGeneration());
    expect(replay).toMatchObject({ accepted: true, messageId: id });
  });

  for (const conversationId of [undefined, 'default']) {
    test(`sendMessageFromApi rejects the second simultaneous request after auth (${conversationId ?? 'inbox'})`, async () => {
      const { orch, ctx, sessionRegistry, messageStore } = await createOrchestrator();
      const auth = deferred<boolean>();
      const provider = deferred<void>();
      const authCheck = spyOn(ctx.strategy, 'checkAuthStatus').mockImplementation(() => auth.promise);
      const execute = spyOn(ctx.strategy, 'executePromptStreaming').mockImplementation(() => provider.promise);
      try {
        const first = orch.sendMessageFromApi('first', conversationId);
        const second = orch.sendMessageFromApi('second', conversationId);
        expect(authCheck).toHaveBeenCalledTimes(2);
        auth.resolve(true);
        const results = await Promise.all([first, second]);
        expect(results[0]?.accepted).toBe(true);
        expect(results[1]).toMatchObject({ accepted: false, error: ERROR_CODE.AGENT_BUSY });
        expect(execute).toHaveBeenCalledTimes(1);
        expect(messageStore.all().filter((message) => message.role === 'user').map((message) => message.body)).toEqual(['first']);
      } finally {
        auth.resolve(true);
        provider.resolve();
        for (const session of sessionRegistry.all()) await waitForIdle(session);
        authCheck.mockRestore();
        execute.mockRestore();
      }
    });
  }

  for (const busyPolicy of ['queue', 'steer'] as const) {
    test(`sendMessageFromApi honors ${busyPolicy} when the target starts during auth`, async () => {
      const { orch, ctx, messageStore } = await createOrchestrator();
      const auth = deferred<boolean>();
      const authCheck = spyOn(ctx.strategy, 'checkAuthStatus').mockImplementation(() => auth.promise);
      const execute = spyOn(ctx.strategy, 'executePromptStreaming');
      const steered: string[] = [];
      if (busyPolicy === 'steer') {
        ctx.strategy.steerAgent = async (text) => { steered.push(text); return 'handled'; };
      }
      try {
        const request = orch.sendMessageFromApi('follow-up', 'default', undefined, undefined, busyPolicy);
        expect(authCheck).toHaveBeenCalledTimes(1);
        ctx.isProcessing = true; // Another request owns the turn while auth awaits.
        auth.resolve(true);
        const result = await request;
        expect(result).toMatchObject({ accepted: true, resolvedPolicy: busyPolicy, conversationId: 'default' });
        expect(execute).not.toHaveBeenCalled();
        expect(messageStore.all().filter((message) => message.role === 'user')).toHaveLength(1);
        if (busyPolicy === 'queue') {
          expect(ctx.queuedTurns.map((turn) => turn.text)).toEqual(['follow-up']);
        } else {
          expect(steered).toEqual(['follow-up']);
          expect(ctx.queuedTurns).toHaveLength(0);
        }
      } finally {
        ctx.isProcessing = false;
        authCheck.mockRestore();
        execute.mockRestore();
      }
    });
  }

  for (const authFailure of ['false', 'throw'] as const) {
    test(`sendMessageFromApi leaves no busy reservation when authentication returns ${authFailure}`, async () => {
      const { orch, ctx, messageStore } = await createOrchestrator();
      const auth = deferred<boolean>();
      const authCheck = spyOn(ctx.strategy, 'checkAuthStatus').mockImplementation(() => auth.promise);
      const execute = spyOn(ctx.strategy, 'executePromptStreaming');
      try {
        const request = orch.sendMessageFromApi('unauthorized', 'default');
        if (authFailure === 'false') {
          auth.resolve(false);
          expect(await request).toEqual({ accepted: false, error: ERROR_CODE.NEED_AUTH });
        } else {
          auth.reject(new Error('auth unavailable'));
          await expect(request).rejects.toThrow('auth unavailable');
        }
        expect(ctx.isProcessing).toBe(false);
        expect(messageStore.all()).toHaveLength(0);
        expect(execute).not.toHaveBeenCalled();
        authCheck.mockRestore();
        expect((await orch.sendMessageFromApi('retry', 'default')).accepted).toBe(true);
        await waitForIdle(ctx);
      } finally {
        authCheck.mockRestore();
        execute.mockRestore();
      }
    });
  }

  test('sendMessageFromApi releases its reservation after message persistence fails and allows retry', async () => {
    const { orch, ctx, messageStore } = await createOrchestrator();
    const flush = spyOn(messageStore, 'flush').mockRejectedValueOnce(new Error('storage unavailable'));
    const execute = spyOn(ctx.strategy, 'executePromptStreaming');
    try {
      await expect(orch.sendMessageFromApi('first', 'default')).rejects.toThrow('storage unavailable');
      expect(ctx.isProcessing).toBe(false);
      expect(execute).not.toHaveBeenCalled();
      flush.mockRestore();
      expect((await orch.sendMessageFromApi('retry', 'default')).accepted).toBe(true);
      await waitForIdle(ctx);
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      flush.mockRestore();
      execute.mockRestore();
    }
  });

  test('sendMessageFromApi runs an accepted queued follow-up after the first persistence failure', async () => {
    const { orch, ctx, messageStore, strategyCalls } = await createOrchestrator();
    const persistence = deferred<void>();
    const enteredPersistence = deferred<void>();
    const flush = spyOn(messageStore, 'flush').mockImplementationOnce(() => {
      enteredPersistence.resolve();
      return persistence.promise;
    });
    try {
      const failed = orch.sendMessageFromApi('failed first turn', 'default');
      await enteredPersistence.promise;
      const followUp = await orch.sendMessageFromApi('accepted follow-up', 'default', undefined, undefined, 'queue');
      expect(followUp).toMatchObject({ accepted: true, resolvedPolicy: 'queue' });
      expect(ctx.queuedTurns).toHaveLength(1);
      persistence.reject(new Error('storage unavailable'));
      await expect(failed).rejects.toThrow('storage unavailable');
      await waitForIdle(ctx);
      expect(ctx.queuedTurns).toHaveLength(0);
      expect(strategyCalls.map((call) => call.prompt)).toEqual(['accepted follow-up']);
    } finally {
      flush.mockRestore();
    }
  });

  test('sendMessageFromApi queue policy accepts same-conversation busy sends', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    ctx.isProcessing = true;

    const result = await orch.sendMessageFromApi(
      'queued',
      'default',
      undefined,
      undefined,
      'queue',
    );

    expect(result.accepted).toBe(true);
    expect(result.resolvedPolicy).toBe('queue');
    expect(ctx.queuedTurns).toHaveLength(1);
    expect(ctx.queuedTurns[0]?.text).toBe('queued');
  });

  test('sendMessageFromApi passes conversation, image, and attachment context into prompt build', async () => {
    const { orch, ctx, sessionRegistry, promptBuilds } =
      await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;

    const result = await orch.sendMessageFromApi(
      ' update the app ',
      'thread-a',
      ['data:image/png;base64,abc'],
      ['notes.txt'],
      'queue',
    );

    expect(result.accepted).toBe(true);
    expect(
      sessionRegistry.all().some((s) => s.conversationId === 'thread-a'),
    ).toBe(true);
    await waitForIdle(
      sessionRegistry.all().find((s) => s.conversationId === 'thread-a') ?? ctx,
    );
    const promptBuild = promptBuilds.at(-1);
    expect(promptBuild?.text).toBe(' update the app ');
    expect(promptBuild?.imageUrls).toHaveLength(1);
    expect(promptBuild?.imageUrls[0]).toMatch(/\.png$/);
    expect(promptBuild?.audioFilename).toBeNull();
    expect(promptBuild?.attachmentFilenames).toEqual(['notes.txt']);
  });

  test('sendMessageFromApi passes configured system prompt to the provider strategy', async () => {
    const { orch, ctx, strategyCalls } = await createOrchestrator(undefined, {
      systemPrompt: 'System prompt from fibe.yml',
      cachedSystemPromptFromFile: 'Built-in fallback prompt',
    });
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;

    const result = await orch.sendMessageFromApi('ship it', 'default');

    expect(result.accepted).toBe(true);
    await waitForIdle(ctx);
    expect(strategyCalls.at(-1)).toMatchObject({
      prompt: 'ship it',
      systemPrompt: 'System prompt from fibe.yml',
      effort: 'max',
    });
  });

  test('injects stored history when a native-session strategy requests prompt history', async () => {
    const { orch, ctx, promptBuilds } = await createOrchestrator(undefined, {
      nativeSessionSupport: true,
      injectPromptHistory: true,
    });
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;

    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'first',
    });
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'second',
    });

    const secondPrompt = promptBuilds.at(-1);
    expect(secondPrompt?.text).toBe('second');
    expect(secondPrompt?.historyMessages).toEqual([
      { role: 'user', body: 'first' },
      { role: 'assistant', body: 'test response' },
    ]);
  });

  test('does not inject stored history for native-session strategies by default', async () => {
    const { orch, ctx, promptBuilds } = await createOrchestrator(undefined, {
      nativeSessionSupport: true,
    });
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;

    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'first',
    });
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'second',
    });

    expect(promptBuilds.at(-1)?.historyMessages).toBeUndefined();
  });

  test('sendMessageFromApi falls back to cached system prompt file when no configured prompt exists', async () => {
    const { orch, ctx, strategyCalls } = await createOrchestrator(undefined, {
      cachedSystemPromptFromFile: 'Built-in fallback prompt',
    });
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;

    const result = await orch.sendMessageFromApi('ship it', 'default');

    expect(result.accepted).toBe(true);
    await waitForIdle(ctx);
    expect(strategyCalls.at(-1)?.systemPrompt).toBe('Built-in fallback prompt');
  });

  test('sendMessageFromApi steer policy uses provider steer when available', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    ctx.isProcessing = true;
    let steered = '';
    (
      ctx.strategy as unknown as { steerAgent?: (message: string) => void }
    ).steerAgent = (message) => {
      steered = message;
    };

    const result = await orch.sendMessageFromApi(
      'steer me',
      'default',
      undefined,
      undefined,
      'steer',
    );

    expect(result.accepted).toBe(true);
    expect(result.resolvedPolicy).toBe('steer');
    expect(steered).toBe('steer me');
    expect(ctx.queuedTurns).toHaveLength(1);
    expect(ctx.queuedTurns[0]?.text).toBe('');
  });

  test('sendMessageFromApi steer policy does not enqueue an empty turn when provider handled steering', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    ctx.isProcessing = true;
    let steered = '';
    (
      ctx.strategy as unknown as {
        steerAgent?: (message: string) => Promise<'handled'>;
      }
    ).steerAgent = async (message) => {
      steered = message;
      return 'handled';
    };

    const result = await orch.sendMessageFromApi(
      'steer native',
      'default',
      undefined,
      undefined,
      'steer',
    );

    expect(result.accepted).toBe(true);
    expect(result.resolvedPolicy).toBe('steer');
    expect(steered).toBe('steer native');
    expect(ctx.queuedTurns).toHaveLength(0);
  });

  test('sendMessageFromApi steer policy falls back to queue when provider cannot steer', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    ctx.isProcessing = true;
    (
      ctx.strategy as unknown as { steerAgent?: (message: string) => void }
    ).steerAgent = undefined;

    const result = await orch.sendMessageFromApi(
      'fallback',
      'default',
      undefined,
      undefined,
      'steer',
    );

    expect(result.accepted).toBe(true);
    expect(result.resolvedPolicy).toBe('queue');
    expect(ctx.queuedTurns).toHaveLength(1);
    expect(ctx.queuedTurns[0]?.text).toBe('fallback');
  });

  test('interruptFromApi interrupts active conversation only', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.conversationId = 'project-a';
    ctx.isProcessing = true;
    let interrupted = 0;
    ctx.strategy.interruptAgent = () => {
      interrupted += 1;
    };

    expect(orch.interruptFromApi('project-b')).toMatchObject({
      accepted: false,
      interrupted: false,
      action: 'interrupt',
      conversationId: 'project-b',
    });
    expect(interrupted).toBe(0);

    expect(orch.interruptFromApi('project-a')).toEqual({
      accepted: true,
      action: 'interrupt',
      interrupted: true,
      conversationId: 'project-a',
    });
    expect(interrupted).toBe(1);
  });

  test('interruptFromApi without conversation targets the only active processing session', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.conversationId = 'detached-project';
    ctx.isProcessing = true;
    ctx.isClientConnected = false;
    let interrupted = 0;
    ctx.strategy.interruptAgent = () => {
      interrupted += 1;
    };

    expect(orch.interruptFromApi()).toEqual({
      accepted: true,
      action: 'interrupt',
      interrupted: true,
      conversationId: 'detached-project',
    });
    expect(interrupted).toBe(1);
  });

  test('interruptFromApi without conversation rejects ambiguous active sessions', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.conversationId = 'project-a';
    ctx.isProcessing = true;
    const second = sessionRegistry.create('project-b');
    second.isProcessing = true;

    expect(orch.interruptFromApi()).toMatchObject({
      accepted: false,
      action: 'interrupt',
      interrupted: false,
      reason: 'Multiple active agent runs; provide conversationId.',
    });
  });

  test('sendMessageFromApi queue policy without conversation targets the only active session', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.conversationId = 'detached-project';
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    ctx.isProcessing = true;

    const result = await orch.sendMessageFromApi(
      'queued to only active',
      undefined,
      undefined,
      undefined,
      'queue',
    );

    expect(result.accepted).toBe(true);
    expect(result.conversationId).toBe('detached-project');
    expect(ctx.queuedTurns).toHaveLength(1);
  });

  test('sendMessageFromApi queue policy rejects ambiguous active sessions without conversation', async () => {
    const { orch, ctx, sessionRegistry } = await createOrchestrator();
    ctx.conversationId = 'project-a';
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    ctx.isProcessing = true;
    const second = sessionRegistry.create('project-b');
    second.isAuthenticated = true;
    second.isProcessing = true;

    const result = await orch.sendMessageFromApi(
      'ambiguous',
      undefined,
      undefined,
      undefined,
      'queue',
    );

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(
      'Multiple active agent runs; provide conversationId.',
    );
  });

  test('removeQueuedTurnFromApi removes a queued turn by id or index', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.conversationId = 'project-a';
    ctx.isProcessing = true;
    ctx.queuedTurns.push(
      {
        id: 'turn-a',
        messageId: 'msg-a',
        text: 'first',
        imageUrls: [],
        audioFilename: null,
        policy: 'queue',
        createdAt: '2026-05-07T20:00:01.000Z',
      },
      {
        id: 'turn-b',
        messageId: 'msg-b',
        text: 'second',
        imageUrls: [],
        audioFilename: null,
        policy: 'queue',
        createdAt: '2026-05-07T20:00:02.000Z',
      },
    );

    expect(orch.removeQueuedTurnFromApi('project-a', 'turn-a')).toEqual({
      removed: true,
      conversationId: 'project-a',
      queueCount: 1,
      messageId: 'msg-a',
    });
    expect(ctx.queuedTurns.map((turn) => turn.text)).toEqual(['second']);

    expect(orch.removeQueuedTurnFromApi('project-a', '0')).toEqual({
      removed: true,
      conversationId: 'project-a',
      queueCount: 0,
      messageId: 'msg-b',
    });
    expect(ctx.queuedTurns).toHaveLength(0);
  });

  test('sendMessageFromApi returns accepted and messageId when authenticated', async () => {
    const { orch, ctx, sessionRegistry, syncMessageContents } =
      await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const result = await orch.sendMessageFromApi('ping');
    expect(result.accepted).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(typeof result.messageId).toBe('string');
    expect(
      sessionRegistry.all().some((s) => s.conversationId === 'inbox'),
    ).toBe(true);
    expect(syncMessageContents.length).toBeGreaterThan(0);
    expect(JSON.parse(syncMessageContents[0] ?? '[]')).toMatchObject([
      { role: 'user', body: 'ping' },
    ]);
    await waitForIdle(ctx);
  });

  test('sendMessageFromApi calls checkAndSendAuthStatus first', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = false;
    orch.isAuthenticated = false;
    const result = await orch.sendMessageFromApi('hello');
    // After checkAndSendAuthStatus, isAuthenticated becomes true
    expect(result.accepted).toBe(true);
    expect(orch.isAuthenticated).toBe(true);
    await waitForIdle(ctx);
  });

  test('handleClientMessage initiate_auth sends auth_success when already authenticated', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = false;
    orch.isAuthenticated = false;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.INITIATE_AUTH });
    const authSuccess = events.find((e) => e.type === WS_EVENT.AUTH_SUCCESS);
    expect(authSuccess).toBeDefined();
    expect(orch.isAuthenticated).toBe(true);
  });

  test('handleClientMessage cancel_auth sets isAuthenticated to false', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.CANCEL_AUTH });
    expect(orch.isAuthenticated).toBe(false);
    const authStatus = events.find((e) => e.type === WS_EVENT.AUTH_STATUS);
    expect(authStatus).toBeDefined();
    expect(authStatus?.data.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
  });

  test('handleClientMessage reauthenticate clears credentials and re-initiates auth', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.REAUTHENTICATE });
    const authStatus = events.find((e) => e.type === WS_EVENT.AUTH_STATUS);
    expect(authStatus).toBeDefined();
    expect(authStatus?.data.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
  });

  test('handleClientMessage logout sets isAuthenticated and isProcessing to false', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    ctx.isProcessing = true;
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    await orch.handleClientMessage(ctx, { action: WS_ACTION.LOGOUT });
    expect(orch.isAuthenticated).toBe(false);
    expect(ctx.isProcessing).toBe(false);
    const authStatus = events.find((e) => e.type === WS_EVENT.AUTH_STATUS);
    expect(authStatus?.data.anyProcessing).toBe(false);
  });

  test('handleClientMessage submit_auth_code passes code to strategy', async () => {
    const { orch, ctx } = await createOrchestrator();
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SUBMIT_AUTH_CODE,
      code: 'test-code',
    });
  });

  test('handleClientMessage submit_story stores story for last assistant', async () => {
    const { orch, ctx } = await createOrchestrator();
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'hi',
    });
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    const story = [
      {
        id: 's1',
        type: 'step',
        message: 'Did something',
        timestamp: new Date().toISOString(),
      },
    ];
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SUBMIT_STORY,
      story,
    });
    const hasActivityEvent = events.some(
      (e) =>
        e.type === WS_EVENT.ACTIVITY_UPDATED ||
        e.type === WS_EVENT.ACTIVITY_APPENDED,
    );
    expect(hasActivityEvent).toBe(true);
  });

  test('handleClientMessage submit_story without prior activity is ignored', async () => {
    const { orch, ctx } = await createOrchestrator();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    ctx.outbound$.subscribe((ev) => events.push(ev));
    const story = [
      {
        id: 's1',
        type: 'step',
        message: 'New story',
        timestamp: new Date().toISOString(),
      },
    ];
    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SUBMIT_STORY,
      story,
    });
    expect(events.some((e) => e.type === WS_EVENT.ACTIVITY_APPENDED)).toBe(
      false,
    );
    expect(events.some((e) => e.type === WS_EVENT.ACTIVITY_UPDATED)).toBe(
      false,
    );
  });

  test('outbound stream exists on session context', async () => {
    const { ctx } = await createOrchestrator();
    expect(ctx.outbound$).toBeDefined();
    expect(typeof ctx.outbound$.subscribe).toBe('function');
  });

  test('messages getter returns message store', async () => {
    const { orch } = await createOrchestrator();
    expect(orch.messages).toBeDefined();
    expect(typeof orch.messages.all).toBe('function');
  });

  test('ensureStrategySettings calls strategy.ensureSettings', async () => {
    const { orch } = await createOrchestrator();
    orch.ensureStrategySettings(); // Should not throw
  });

  test('handleClientMessage unknown action warns but does not throw', async () => {
    const { orch, ctx } = await createOrchestrator();
    await orch.handleClientMessage(ctx, { action: 'nonexistent_action' });
  });

  test('setAgentMode emits AGENT_MODE_UPDATED event', async () => {
    const { orch, ctx } = await createOrchestrator();
    const events: { type: string; data: unknown }[] = [];
    ctx.outbound$.subscribe((e: { type: string; data: unknown }) =>
      events.push(e),
    );

    const result = orch.setAgentMode('exploring');
    expect(result).toBe(AGENT_MODES.exploring);

    const modeEvent = events.find(
      (e) => e.type === WS_EVENT.AGENT_MODE_UPDATED,
    );
    expect(modeEvent).toBeDefined();
    expect((modeEvent?.data as { mode: string })?.mode).toBe(
      AGENT_MODES.exploring,
    );
  });

  test('setAgentMode with display string is accepted', async () => {
    const { orch } = await createOrchestrator();
    const result = orch.setAgentMode('Casting...');
    expect(result).toBe(AGENT_MODES.casting);
  });

  test('setAgentMode accepts MODE:BUILD and rejects retired mode triggers', async () => {
    const { orch } = await createOrchestrator();
    expect(orch.setAgentMode('MODE:BUILD')).toBe(AGENT_MODES.build);
    expect(orch.setAgentMode('MODE:BROWNFIELD')).toBeNull();
  });

  test('setAgentMode with unknown mode returns null and does not emit', async () => {
    const { orch, ctx } = await createOrchestrator();
    const events: { type: string; data: unknown }[] = [];
    ctx.outbound$.subscribe((e: { type: string; data: unknown }) =>
      events.push(e),
    );

    const result = orch.setAgentMode('hacking');
    expect(result).toBeNull();
    expect(
      events.find((e) => e.type === WS_EVENT.AGENT_MODE_UPDATED),
    ).toBeUndefined();
  });

  test('handleClientConnected sends agent_mode_updated with current mode', async () => {
    const { orch, ctx } = await createOrchestrator();
    orch.setAgentMode('casting');

    const events: { type: string; data: unknown }[] = [];
    ctx.outbound$.subscribe((e: { type: string; data: unknown }) =>
      events.push(e),
    );
    await orch.handleClientConnected(ctx);

    const modeEvent = events.find(
      (e) => e.type === WS_EVENT.AGENT_MODE_UPDATED,
    );
    expect(modeEvent).toBeDefined();
    expect((modeEvent?.data as { mode: string })?.mode).toBe(
      AGENT_MODES.casting,
    );
  });

  test('answer_user_question resolves a pending LocalMcp question', async () => {
    const { service: localMcp, resolved } = makeLocalMcpStub();
    const { orch, ctx } = await createOrchestrator(localMcp);

    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.ANSWER_USER_QUESTION,
      questionId: 'q-abc',
      answer: 'Paris',
    } as never);

    expect(resolved.get('q-abc')).toEqual({ answer: 'Paris' });
  });

  test('confirm_action_response resolves a pending LocalMcp confirm (confirmed=true)', async () => {
    const { service: localMcp, resolved } = makeLocalMcpStub();
    const { orch, ctx } = await createOrchestrator(localMcp);

    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.CONFIRM_ACTION_RESPONSE,
      questionId: 'q-xyz',
      confirmed: true,
    } as never);

    expect(resolved.get('q-xyz')).toEqual({ confirmed: true });
  });

  test('confirm_action_response with confirmed=false passes false', async () => {
    const { service: localMcp, resolved } = makeLocalMcpStub();
    const { orch, ctx } = await createOrchestrator(localMcp);

    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.CONFIRM_ACTION_RESPONSE,
      questionId: 'q-no',
      confirmed: false,
    } as never);

    expect(resolved.get('q-no')).toEqual({ confirmed: false });
  });

  test('LocalMcp outbound$ events are forwarded to orchestrator outbound', async () => {
    const { service: localMcp } = makeLocalMcpStub();
    const { ctx } = await createOrchestrator(localMcp);

    const events: { type: string; data: unknown }[] = [];
    ctx.outbound$.subscribe((e) => events.push(e));

    (
      localMcp as unknown as {
        outbound$: Subject<{ type: string; data: Record<string, unknown> }>;
      }
    ).outbound$.next({
      type: 'ask_user_prompt',
      data: { questionId: 'q1', question: 'Name?' },
    });

    const fwdEvent = events.find((e) => e.type === 'ask_user_prompt');
    expect(fwdEvent).toBeDefined();
    expect((fwdEvent?.data as Record<string, unknown>)['questionId']).toBe(
      'q1',
    );
  });

  test('send_chat_message with EXECUTE_CLI from GemmaRouter short-circuits to CLI execution', async () => {
    const { service: localMcp } = makeLocalMcpStub();
    const { orch, ctx } = await createOrchestrator(localMcp);
    ctx.isAuthenticated = true;
    orch.isAuthenticated = true;

    const configSpy = spyOn(
      orch['config'],
      'isGemmaRouterEnabled',
    ).mockReturnValue(true);
    orch['gemmaMcpTools'].getTools = () => [
      { name: 'fibe', description: 'desc' },
    ];
    orch['gemmaRouter'].analyze = async () => ({
      skipped: false,
      action: { type: 'EXECUTE_CLI', command: 'echo hello_from_cli' },
    });

    const events: { type: string; data: Record<string, unknown> }[] = [];
    ctx.outbound$.subscribe((e) =>
      events.push(e as { type: string; data: Record<string, unknown> }),
    );

    await orch.handleClientMessage(ctx, {
      action: WS_ACTION.SEND_CHAT_MESSAGE,
      text: 'hello CLI',
    });

    expect(
      events.some(
        (e) =>
          e.type === WS_EVENT.STREAM_START && e.data.model === 'CLI Router',
      ),
    ).toBe(true);
    const chunkEvents = events.filter((e) => e.type === WS_EVENT.STREAM_CHUNK);
    expect(chunkEvents.length).toBeGreaterThan(0);
    const allChunks = chunkEvents.map((e) => String(e.data.text)).join('');
    expect(allChunks).toContain('hello_from_cli');
    expect(events.some((e) => e.type === WS_EVENT.STREAM_END)).toBe(true);

    configSpy.mockRestore();
  });
});
