import { randomUUID } from 'node:crypto';
import type { ActivityStoreService } from '../activity-store/activity-store.service';
import type {
  StreamingCallbacks,
  TokenUsage,
  ToolEvent,
} from '../strategies/strategy.types';
import { WS_EVENT } from '../ws.constants';

export interface StreamingCallbacksDeps {
  send: (type: string, data?: Record<string, unknown>) => void;
  activityStore: ActivityStoreService;
  getCurrentActivityId: () => string | null;
  getReasoningText: () => string;
  appendReasoningText: (t: string) => void;
  clearReasoningText: () => void;
  setLastStreamUsage: (u: TokenUsage | undefined) => void;
}

export function createStreamingCallbacks(
  deps: StreamingCallbacksDeps
): StreamingCallbacks {
  return {
    onReasoningStart: () => deps.send(WS_EVENT.REASONING_START, {}),
    onReasoningChunk: (reasoningText) => {
      deps.appendReasoningText(reasoningText);
      deps.send(WS_EVENT.REASONING_CHUNK, { text: reasoningText });
    },
    onReasoningEnd: () => {
      deps.send(WS_EVENT.REASONING_END, {});
      const activityId = deps.getCurrentActivityId();
      const buf = deps.getReasoningText().trim();
      if (activityId && buf) {
        deps.activityStore.appendEntry(activityId, {
          id: randomUUID(),
          type: 'reasoning_start',
          message: 'Reasoning',
          timestamp: new Date().toISOString(),
          details: buf,
        });
      }
      deps.clearReasoningText();
    },
    onStep: (step) => {
      deps.send(WS_EVENT.THINKING_STEP, {
        id: step.id,
        title: step.title,
        status: step.status,
        details: step.details,
        timestamp: step.timestamp instanceof Date ? step.timestamp.toISOString() : step.timestamp,
      });
      const activityId = deps.getCurrentActivityId();
      if (activityId) {
        deps.activityStore.appendEntry(activityId, {
          id: step.id,
          type: 'step',
          message: step.title,
          timestamp:
            step.timestamp instanceof Date
              ? step.timestamp.toISOString()
              : String(step.timestamp),
          details: step.details,
        });
      }
    },
    onAuthRequired: (url) => {
      deps.send(WS_EVENT.AUTH_URL_GENERATED, { url });
    },
    onUsage: (usage) => {
      deps.setLastStreamUsage(usage);
    },
    onTool: (event: ToolEvent) => {
      if (event.kind === 'file_created') {
        deps.send(WS_EVENT.FILE_CREATED, {
          name: event.name,
          path: event.path,
          summary: event.summary,
        });
        const activityId = deps.getCurrentActivityId();
        if (activityId) {
          deps.activityStore.appendEntry(activityId, {
            id: randomUUID(),
            type: 'file_created',
            message: event.summary ?? event.name,
            timestamp: new Date().toISOString(),
            path: event.path,
          });
        }
      } else {
        deps.send(WS_EVENT.TOOL_CALL, {
          name: event.name,
          path: event.path,
          summary: event.summary,
          command: event.command,
          details: event.details,
        });
        const activityId = deps.getCurrentActivityId();
        if (activityId) {
          deps.activityStore.appendEntry(activityId, {
            id: randomUUID(),
            type: 'tool_call',
            message: event.summary ?? event.name,
            timestamp: new Date().toISOString(),
            command: event.command,
            details: event.details,
          });
        }
      }
    },
  };
}
