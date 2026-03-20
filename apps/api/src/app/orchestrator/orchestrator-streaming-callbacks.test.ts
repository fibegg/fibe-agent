import { describe, test, expect, beforeEach } from 'bun:test';
import { createStreamingCallbacks, type StreamingCallbacksDeps } from './orchestrator-streaming-callbacks';
import { WS_EVENT } from '../ws.constants';

describe('createStreamingCallbacks', () => {
  let sent: Array<{ type: string; data?: Record<string, unknown> }>;
  let reasoningBuf: string;
  let lastUsage: unknown;
  let deps: StreamingCallbacksDeps;

  const activityEntries: Array<{ id: string; entry: Record<string, unknown> }> = [];
  let currentActivityId: string | null;

  beforeEach(() => {
    sent = [];
    reasoningBuf = '';
    lastUsage = undefined;
    currentActivityId = 'act-1';
    activityEntries.length = 0;

    deps = {
      send: (type, data) => sent.push({ type, data }),
      activityStore: {
        appendEntry: (id: string, entry: Record<string, unknown>) => activityEntries.push({ id, entry }),
      } as never,
      getCurrentActivityId: () => currentActivityId,
      getReasoningText: () => reasoningBuf,
      appendReasoningText: (t: string) => { reasoningBuf += t; },
      clearReasoningText: () => { reasoningBuf = ''; },
      setLastStreamUsage: (u) => { lastUsage = u; },
    };
  });

  test('onReasoningStart sends REASONING_START', () => {
    const cbs = createStreamingCallbacks(deps);
    cbs.onReasoningStart();
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe(WS_EVENT.REASONING_START);
  });

  test('onReasoningChunk accumulates text and sends REASONING_CHUNK', () => {
    const cbs = createStreamingCallbacks(deps);
    cbs.onReasoningChunk('hello ');
    cbs.onReasoningChunk('world');
    expect(reasoningBuf).toBe('hello world');
    expect(sent).toHaveLength(2);
    expect(sent[0].type).toBe(WS_EVENT.REASONING_CHUNK);
    expect(sent[0].data?.text).toBe('hello ');
  });

  test('onReasoningEnd sends REASONING_END and appends to activity store', () => {
    const cbs = createStreamingCallbacks(deps);
    cbs.onReasoningChunk('thinking text');
    cbs.onReasoningEnd();
    expect(sent.find((e) => e.type === WS_EVENT.REASONING_END)).toBeDefined();
    expect(activityEntries).toHaveLength(1);
    expect(activityEntries[0].id).toBe('act-1');
    expect(activityEntries[0].entry.type).toBe('reasoning_start');
    expect(activityEntries[0].entry.details).toBe('thinking text');
    expect(reasoningBuf).toBe('');
  });

  test('onReasoningEnd does not append when buffer is empty', () => {
    const cbs = createStreamingCallbacks(deps);
    cbs.onReasoningEnd();
    expect(activityEntries).toHaveLength(0);
  });

  test('onReasoningEnd does not append when activityId is null', () => {
    currentActivityId = null;
    const cbs = createStreamingCallbacks(deps);
    cbs.onReasoningChunk('text');
    cbs.onReasoningEnd();
    expect(activityEntries).toHaveLength(0);
  });

  test('onStep sends THINKING_STEP and appends to activity store', () => {
    const cbs = createStreamingCallbacks(deps);
    const step = {
      id: 'step-1',
      title: 'Running tool',
      status: 'processing' as const,
      details: 'some details',
      timestamp: new Date('2026-01-01'),
    };
    cbs.onStep(step);
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe(WS_EVENT.THINKING_STEP);
    expect(sent[0].data?.title).toBe('Running tool');
    expect(sent[0].data?.timestamp).toBe(step.timestamp.toISOString());
    expect(activityEntries).toHaveLength(1);
    expect(activityEntries[0].entry.message).toBe('Running tool');
  });

  test('onStep with string timestamp works', () => {
    const cbs = createStreamingCallbacks(deps);
    const step = {
      id: 'step-2',
      title: 'Test',
      status: 'complete' as const,
      timestamp: '2026-01-01T00:00:00.000Z' as unknown as Date,
    };
    cbs.onStep(step);
    expect(sent[0].data?.timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  test('onStep does not append when activityId is null', () => {
    currentActivityId = null;
    const cbs = createStreamingCallbacks(deps);
    cbs.onStep({
      id: 's1', title: 'T', status: 'pending',
      timestamp: new Date(),
    });
    expect(activityEntries).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  test('onAuthRequired sends AUTH_URL_GENERATED', () => {
    const cbs = createStreamingCallbacks(deps);
    cbs.onAuthRequired('https://auth.example.com');
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe(WS_EVENT.AUTH_URL_GENERATED);
    expect(sent[0].data?.url).toBe('https://auth.example.com');
  });

  test('onUsage stores usage via deps', () => {
    const cbs = createStreamingCallbacks(deps);
    const usage = { inputTokens: 10, outputTokens: 20 };
    cbs.onUsage(usage);
    expect(lastUsage).toEqual(usage);
  });

  test('onTool file_created sends FILE_CREATED and appends to activity', () => {
    const cbs = createStreamingCallbacks(deps);
    cbs.onTool({
      kind: 'file_created',
      name: 'test.ts',
      path: '/src/test.ts',
      summary: 'Created test file',
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe(WS_EVENT.FILE_CREATED);
    expect(sent[0].data?.name).toBe('test.ts');
    expect(activityEntries).toHaveLength(1);
    expect(activityEntries[0].entry.type).toBe('file_created');
  });

  test('onTool tool_call sends TOOL_CALL and appends to activity', () => {
    const cbs = createStreamingCallbacks(deps);
    cbs.onTool({
      kind: 'tool_call',
      name: 'bash',
      command: 'ls -la',
      summary: 'Listed files',
      details: 'extra info',
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe(WS_EVENT.TOOL_CALL);
    expect(sent[0].data?.command).toBe('ls -la');
    expect(activityEntries).toHaveLength(1);
    expect(activityEntries[0].entry.type).toBe('tool_call');
    expect(activityEntries[0].entry.command).toBe('ls -la');
  });

  test('onTool does not append when activityId is null', () => {
    currentActivityId = null;
    const cbs = createStreamingCallbacks(deps);
    cbs.onTool({ kind: 'file_created', name: 'x.ts' });
    expect(sent).toHaveLength(1);
    expect(activityEntries).toHaveLength(0);
  });
});
