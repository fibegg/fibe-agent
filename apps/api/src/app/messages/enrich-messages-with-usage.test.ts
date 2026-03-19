import { describe, test, expect } from 'bun:test';
import { enrichMessagesWithActivityUsage } from './enrich-messages-with-usage';

describe('enrichMessagesWithActivityUsage', () => {
  test('returns messages unchanged when no activities have usage', () => {
    const messages = [
      { id: '1', role: 'user', body: 'hi', created_at: '' },
      { id: '2', role: 'assistant', body: 'hey', created_at: '', activityId: 'act-1' },
    ];
    const activities = [{ id: 'act-1', created_at: '', story: [] }];
    const result = enrichMessagesWithActivityUsage(messages, activities);
    expect(result).toHaveLength(2);
    expect(result[1].usage).toBeUndefined();
  });

  test('attaches usage to assistant message when activity has usage', () => {
    const messages = [
      { id: '1', role: 'assistant', body: 'reply', created_at: '', activityId: 'act-1' },
    ];
    const activities = [
      { id: 'act-1', created_at: '', story: [], usage: { inputTokens: 100, outputTokens: 200 } },
    ];
    const result = enrichMessagesWithActivityUsage(messages, activities);
    expect(result[0].usage).toEqual({ inputTokens: 100, outputTokens: 200 });
  });

  test('leaves user messages unchanged', () => {
    const messages = [
      { id: '1', role: 'user', body: 'hi', created_at: '' },
    ];
    const activities = [
      { id: 'act-1', created_at: '', story: [], usage: { inputTokens: 1, outputTokens: 2 } },
    ];
    const result = enrichMessagesWithActivityUsage(messages, activities);
    expect(result[0]).toEqual(messages[0]);
    expect((result[0] as { usage?: unknown }).usage).toBeUndefined();
  });

  test('leaves assistant message without activityId unchanged', () => {
    const messages = [
      { id: '1', role: 'assistant', body: 'reply', created_at: '' },
    ];
    const activities = [
      { id: 'act-1', created_at: '', story: [], usage: { inputTokens: 10, outputTokens: 20 } },
    ];
    const result = enrichMessagesWithActivityUsage(messages, activities);
    expect(result[0].usage).toBeUndefined();
  });

  test('does not attach usage when activity usage is invalid', () => {
    const messages = [
      { id: '1', role: 'assistant', body: 'reply', created_at: '', activityId: 'act-1' },
    ];
    const activities = [
      { id: 'act-1', created_at: '', story: [], usage: { inputTokens: 1 } as unknown as { inputTokens: number; outputTokens: number } },
    ];
    const result = enrichMessagesWithActivityUsage(messages, activities);
    expect(result[0].usage).toBeUndefined();
  });
});
