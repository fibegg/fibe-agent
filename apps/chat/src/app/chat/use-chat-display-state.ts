import { useMemo } from 'react';
import { CHAT_STATES } from './chat-state';
import type { StoredActivityEntry } from './chat-state';
import type { ThinkingActivity } from './thinking-types';
import { buildFullStoryItems, computeSessionStats, toTimestampMs } from '../agent-thinking-utils';
import { useMobileBrainClasses } from './use-mobile-brain-classes';
import type { ChatMessage } from './message-list';

export interface UseChatDisplayStateParams {
  messages: ChatMessage[];
  searchQuery: string;
  state: string;
  activityLog: ThinkingActivity[];
  sessionActivity: StoredActivityEntry[];
  lastSentMessage: string | null;
}

export function useChatDisplayState({
  messages,
  searchQuery,
  state,
  activityLog,
  sessionActivity,
  lastSentMessage,
}: UseChatDisplayStateParams) {
  const filteredMessages = useMemo(
    () =>
      searchQuery.trim() === ''
        ? messages
        : messages.filter((m) =>
            m.body?.toLowerCase().includes(searchQuery.trim().toLowerCase())
          ),
    [messages, searchQuery]
  );

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant'),
    [messages]
  );

  const lastUserMessageFromHistory = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'user')?.body ?? null,
    [messages]
  );

  const lastUserMessage = lastSentMessage ?? lastUserMessageFromHistory;

  const displayStory = useMemo(
    () =>
      state === CHAT_STATES.AWAITING_RESPONSE
        ? activityLog
        : (lastAssistantMessage?.story ?? []),
    [state, activityLog, lastAssistantMessage]
  );

  const pastActivityFromMessages = useMemo(
    () =>
      messages
        .filter((m) => m.role === 'assistant' && Array.isArray(m.story))
        .map((m) => ({
          id: m.activityId ?? m.created_at,
          created_at: m.created_at,
          story: m.story!,
        })),
    [messages]
  );

  const sessionTimeMs = useMemo(() => {
    const allEntries = [
      ...sessionActivity.flatMap((t) =>
        (t.story ?? []).map((s) => ({ created_at: t.created_at, ts: s.timestamp }))
      ),
      ...displayStory.map((s) => ({
        created_at: typeof s.timestamp === 'string' ? s.timestamp : (s.timestamp as Date)?.toISOString?.() ?? '',
        ts: s.timestamp,
      })),
    ].filter((e) => e.created_at || e.ts);
    const times = allEntries.map((e) => toTimestampMs(e.ts, e.created_at));
    const firstTs = times.length ? Math.min(...times) : 0;
    const lastTs = times.length ? Math.max(...times) : 0;
    const isStreaming = state === CHAT_STATES.AWAITING_RESPONSE;
    return lastTs && firstTs ? (isStreaming ? Date.now() - firstTs : lastTs - firstTs) : 0;
  }, [sessionActivity, displayStory, state]);

  const mobileSessionStats = useMemo(
    () =>
      computeSessionStats(
        sessionActivity,
        pastActivityFromMessages,
        displayStory,
        state === CHAT_STATES.AWAITING_RESPONSE
      ),
    [sessionActivity, pastActivityFromMessages, displayStory, state]
  );

  const sessionTokenUsage = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    for (const m of messages) {
      if (m.role === 'assistant' && m.usage) {
        inputTokens += m.usage.inputTokens;
        outputTokens += m.usage.outputTokens;
      }
    }
    return inputTokens > 0 || outputTokens > 0 ? { inputTokens, outputTokens } : null;
  }, [messages]);

  const mobileFullStoryItems = useMemo(
    () => buildFullStoryItems(sessionActivity, pastActivityFromMessages, displayStory),
    [sessionActivity, pastActivityFromMessages, displayStory]
  );

  const mobileLastStoryItem =
    mobileFullStoryItems.length > 0 ? mobileFullStoryItems[mobileFullStoryItems.length - 1] : null;

  const mobileBrainClasses = useMobileBrainClasses(
    state === CHAT_STATES.AWAITING_RESPONSE,
    mobileLastStoryItem
  );

  return {
    filteredMessages,
    lastAssistantMessage,
    lastUserMessageFromHistory,
    lastUserMessage,
    displayStory,
    pastActivityFromMessages,
    sessionTimeMs,
    mobileSessionStats,
    mobileFullStoryItems,
    mobileLastStoryItem,
    mobileBrainClasses,
    sessionTokenUsage,
  };
}
