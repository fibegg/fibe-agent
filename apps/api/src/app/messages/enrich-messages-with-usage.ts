import type { StoredMessage } from '../message-store/message-store.service';
import type { StoredActivityEntry } from '../activity-store/activity-store.service';

export function enrichMessagesWithActivityUsage(
  messages: StoredMessage[],
  activities: StoredActivityEntry[]
): (StoredMessage & { usage?: StoredActivityEntry['usage'] })[] {
  const usageByActivityId = new Map<string, StoredActivityEntry['usage']>();
  for (const a of activities) {
    if (a.usage && typeof a.usage.inputTokens === 'number' && typeof a.usage.outputTokens === 'number') {
      usageByActivityId.set(a.id, a.usage);
    }
  }
  return messages.map((msg) => {
    if (msg.role !== 'assistant' || !msg.activityId) return msg;
    const usage = usageByActivityId.get(msg.activityId);
    if (!usage) return msg;
    return { ...msg, usage };
  });
}
