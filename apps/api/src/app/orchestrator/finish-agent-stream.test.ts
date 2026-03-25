import { describe, test, expect, beforeEach } from 'bun:test';
import { finishAgentStream, type FinishAgentStreamDeps } from './finish-agent-stream';
import { WS_EVENT } from '@shared/ws-constants';

describe('finishAgentStream', () => {
  let sent: Array<{ type: string; data?: Record<string, unknown> }>;
  let addedMessages: Array<{ role: string; text: string }>;
  let syncedMessages: string[];
  let usageSet: Array<{ id: string; usage: unknown }>;
  let currentActivityId: string | null;
  let activityById: Record<string, Record<string, unknown>>;
  let lastStreamUsageCleared: boolean;

  let deps: FinishAgentStreamDeps;

  beforeEach(() => {
    sent = [];
    addedMessages = [];
    syncedMessages = [];
    usageSet = [];
    currentActivityId = 'act-1';
    activityById = {
      'act-1': { id: 'act-1', story: [] },
    };
    lastStreamUsageCleared = false;

    deps = {
      messageStore: {
        add: (role: string, text: string) => addedMessages.push({ role, text }),
        all: () => [],
      } as never,
      modelStore: {
        get: () => '',
      } as never,
      activityStore: {
        setUsage: (id: string, usage: unknown) => usageSet.push({ id, usage }),
        getById: (id: string) => activityById[id] ?? null,
      } as never,
      fibeSync: {
        syncMessages: async (s: string) => { syncedMessages.push(s); },
      } as never,
      send: (type, data) => sent.push({ type, data }),
      getCurrentActivityId: () => currentActivityId,
      clearLastStreamUsage: () => { lastStreamUsageCleared = true; },
    };
  });

  test('adds assistant message and sends stream_end', () => {
    const step = { id: 's1', title: 'Generating', status: 'processing' as const, timestamp: new Date() };
    finishAgentStream(deps, 'response text', 's1', step);
    expect(addedMessages).toHaveLength(1);
    expect(addedMessages[0].role).toBe('assistant');
    expect(addedMessages[0].text).toBe('response text');
    const streamEnd = sent.find((e) => e.type === WS_EVENT.STREAM_END);
    expect(streamEnd).toBeDefined();
  });

  test('uses fallback when accumulated is empty', () => {
    const step = { id: 's1', title: 'Gen', status: 'processing' as const, timestamp: new Date() };
    finishAgentStream(deps, '', 's1', step);
    expect(addedMessages[0].text).toBe('The agent produced no visible output.');
  });

  test('sends complete thinking step', () => {
    const step = { id: 's1', title: 'Working', status: 'processing' as const, timestamp: new Date(), details: 'info' };
    finishAgentStream(deps, 'ok', 's1', step);
    const thinkingStep = sent.find((e) => e.type === WS_EVENT.THINKING_STEP);
    expect(thinkingStep).toBeDefined();
    expect(thinkingStep?.data?.status).toBe('complete');
    expect(thinkingStep?.data?.details).toBe('info');
  });

  test('includes usage in stream_end when provided', () => {
    const step = { id: 's1', title: 'Gen', status: 'processing' as const, timestamp: new Date() };
    const usage = { inputTokens: 100, outputTokens: 50 };
    finishAgentStream(deps, 'text', 's1', step, usage);
    const streamEnd = sent.find((e) => e.type === WS_EVENT.STREAM_END);
    expect(streamEnd?.data?.usage).toEqual(usage);
  });

  test('sets usage on activity store and sends update when activityId + usage present', () => {
    const step = { id: 's1', title: 'Gen', status: 'processing' as const, timestamp: new Date() };
    const usage = { inputTokens: 10, outputTokens: 5 };
    finishAgentStream(deps, 'text', 's1', step, usage);
    expect(usageSet).toHaveLength(1);
    expect(usageSet[0].id).toBe('act-1');
    const activityUpdated = sent.find((e) => e.type === WS_EVENT.ACTIVITY_UPDATED);
    expect(activityUpdated).toBeDefined();
  });

  test('does not set usage when activityId is null', () => {
    currentActivityId = null;
    const step = { id: 's1', title: 'Gen', status: 'processing' as const, timestamp: new Date() };
    finishAgentStream(deps, 'text', 's1', step, { inputTokens: 1, outputTokens: 1 });
    expect(usageSet).toHaveLength(0);
  });

  test('does not send activity_updated when getById returns null', () => {
    activityById = {};
    const step = { id: 's1', title: 'Gen', status: 'processing' as const, timestamp: new Date() };
    finishAgentStream(deps, 'text', 's1', step, { inputTokens: 1, outputTokens: 1 });
    expect(sent.find((e) => e.type === WS_EVENT.ACTIVITY_UPDATED)).toBeUndefined();
  });

  test('clears lastStreamUsage', () => {
    const step = { id: 's1', title: 'Gen', status: 'processing' as const, timestamp: new Date() };
    finishAgentStream(deps, 'ok', 's1', step);
    expect(lastStreamUsageCleared).toBe(true);
  });

  test('syncs messages after adding', () => {
    const step = { id: 's1', title: 'Gen', status: 'processing' as const, timestamp: new Date() };
    finishAgentStream(deps, 'ok', 's1', step);
    expect(syncedMessages).toHaveLength(1);
  });
});
