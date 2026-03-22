import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatActivityLog } from './use-chat-activity-log';

describe('useChatActivityLog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with empty state', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    expect(result.current.activityLog).toEqual([]);
    expect(result.current.thinkingSteps).toEqual([]);
    expect(result.current.reasoningText).toBe('');
  });

  it('exposes thinkingCallbacks and resetForNewStream', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    expect(typeof result.current.thinkingCallbacks).toBe('object');
    expect(typeof result.current.resetForNewStream).toBe('function');
    expect(typeof result.current.thinkingCallbacks.onReasoningStart).toBe('function');
    expect(typeof result.current.thinkingCallbacks.onReasoningChunk).toBe('function');
    expect(typeof result.current.thinkingCallbacks.onReasoningEnd).toBe('function');
    expect(typeof result.current.thinkingCallbacks.onThinkingStep).toBe('function');
    expect(typeof result.current.thinkingCallbacks.onToolOrFile).toBe('function');
    expect(typeof result.current.thinkingCallbacks.onStreamStartData).toBe('function');
  });

  it('resetForNewStream clears state and adds stream_start entry', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    act(() => { result.current.resetForNewStream(); });
    expect(result.current.activityLog.length).toBe(1);
    expect(result.current.activityLog[0].type).toBe('stream_start');
    expect(result.current.reasoningText).toBe('');
    expect(result.current.thinkingSteps).toEqual([]);
  });

  it('resetForNewStream includes model info when provided', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    act(() => { result.current.resetForNewStream({ model: 'claude-3' }); });
    expect(result.current.activityLog[0].details).toContain('claude-3');
  });

  it('onReasoningStart adds reasoning_start activity entry', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    act(() => { result.current.thinkingCallbacks.onReasoningStart(); });
    expect(result.current.activityLog.length).toBe(1);
    expect(result.current.activityLog[0].type).toBe('reasoning_start');
    expect(result.current.activityLog[0].message).toBe('Thinking');
  });

  it('onReasoningChunk appends text and updates entry details', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    act(() => { result.current.thinkingCallbacks.onReasoningStart(); });
    act(() => { result.current.thinkingCallbacks.onReasoningChunk('Hello '); });
    act(() => { result.current.thinkingCallbacks.onReasoningChunk('World'); });
    expect(result.current.reasoningText).toBe('Hello World');
    expect(result.current.activityLog[0].details).toBe('Hello World');
  });

  it('onReasoningEnd updates message to "Thinking completed"', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    act(() => { result.current.thinkingCallbacks.onReasoningStart(); });
    act(() => { result.current.thinkingCallbacks.onReasoningEnd(); });
    expect(result.current.activityLog[0].message).toBe('Thinking completed');
  });

  it('onReasoningEnd does nothing if no entry id', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    // No onReasoningStart called → thinkingEntryIdRef is null
    act(() => { result.current.thinkingCallbacks.onReasoningEnd(); });
    expect(result.current.activityLog).toEqual([]);
  });

  it('onReasoningChunk does nothing if no entry id', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    act(() => { result.current.thinkingCallbacks.onReasoningChunk('text'); });
    expect(result.current.activityLog).toEqual([]);
  });

  it('onThinkingStep adds new step', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    const step = { id: '1', title: 'Generating', status: 'complete' as const, timestamp: new Date() };
    act(() => { result.current.thinkingCallbacks.onThinkingStep(step); });
    expect(result.current.thinkingSteps).toHaveLength(1);
    expect(result.current.thinkingSteps[0].id).toBe('1');
  });

  it('onThinkingStep updates existing step with same id', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    const step1 = { id: '1', title: 'Generating', status: 'pending' as const, timestamp: new Date() };
    const step2 = { id: '1', title: 'Generating', status: 'complete' as const, timestamp: new Date() };
    act(() => { result.current.thinkingCallbacks.onThinkingStep(step1); });
    act(() => { result.current.thinkingCallbacks.onThinkingStep(step2); });
    expect(result.current.thinkingSteps).toHaveLength(1);
    expect(result.current.thinkingSteps[0].status).toBe('complete');
  });

  it('onThinkingStep adds activity log entry', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    const step = { id: '1', title: 'Gen', status: 'complete' as const, timestamp: new Date() };
    act(() => { result.current.thinkingCallbacks.onThinkingStep(step); });
    expect(result.current.activityLog.some(e => e.type === 'step')).toBe(true);
  });

  it('onThinkingStep handles string timestamp', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    const step = { id: '1', title: 'Gen', status: 'complete' as const, timestamp: '2024-01-01T00:00:00Z' as unknown as Date };
    act(() => { result.current.thinkingCallbacks.onThinkingStep(step); });
    expect(result.current.activityLog[0].timestamp instanceof Date).toBe(true);
  });

  it('onToolOrFile adds file_created entry', () => {
    const refetch = vi.fn();
    const { result } = renderHook(() => useChatActivityLog(refetch));
    act(() => {
      result.current.thinkingCallbacks.onToolOrFile({ kind: 'file_created', name: 'app.ts', path: '/app.ts' });
    });
    expect(refetch).toHaveBeenCalled();
    const entry = result.current.activityLog.find(e => e.type === 'file_created');
    expect(entry).toBeTruthy();
    expect(entry?.message).toContain('/app.ts');
  });

  it('onToolOrFile adds tool_call entry with command', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    act(() => {
      result.current.thinkingCallbacks.onToolOrFile({ kind: 'tool_call', name: 'bash', command: 'ls -la' });
    });
    const entry = result.current.activityLog.find(e => e.type === 'tool_call');
    expect(entry?.message).toBe('ls -la');
  });

  it('onToolOrFile adds tool_call entry without command uses name', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    act(() => {
      result.current.thinkingCallbacks.onToolOrFile({ kind: 'tool_call', name: 'myTool' });
    });
    const entry = result.current.activityLog.find(e => e.type === 'tool_call');
    expect(entry?.message).toContain('myTool');
  });

  it('onStreamStartData is a no-op function', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    expect(() => {
      result.current.thinkingCallbacks.onStreamStartData({ model: 'test' });
    }).not.toThrow();
  });

  it('setActivityLog and setThinkingSteps are exposed', () => {
    const { result } = renderHook(() => useChatActivityLog(vi.fn()));
    expect(typeof result.current.setActivityLog).toBe('function');
    expect(typeof result.current.setThinkingSteps).toBe('function');
    expect(typeof result.current.setReasoningText).toBe('function');
  });
});
