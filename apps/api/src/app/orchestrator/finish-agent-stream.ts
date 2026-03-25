import type { ActivityStoreService } from '../activity-store/activity-store.service';
import type { MessageStoreService } from '../message-store/message-store.service';
import type { ModelStoreService } from '../model-store/model-store.service';
import type { FibeSyncService } from '../fibe-sync/fibe-sync.service';
import { DEFAULT_PROVIDER } from '../strategies/strategy-registry.service';
import type { ThinkingStep, TokenUsage } from '../strategies/strategy.types';
import { WS_EVENT } from '@shared/ws-constants';

export interface FinishAgentStreamDeps {
  messageStore: MessageStoreService;
  modelStore: ModelStoreService;
  activityStore: ActivityStoreService;
  fibeSync: FibeSyncService;
  send: (type: string, data?: Record<string, unknown>) => void;
  getCurrentActivityId: () => string | null;
  clearLastStreamUsage: () => void;
}

export function finishAgentStream(
  deps: FinishAgentStreamDeps,
  accumulated: string,
  stepId: string,
  step: ThinkingStep,
  usage?: TokenUsage
): void {
  const finalText = accumulated || 'The agent produced no visible output.';
  const storedModel = (deps.modelStore.get() || '').trim();
  const model = storedModel || process.env.AGENT_PROVIDER || DEFAULT_PROVIDER;
  deps.messageStore.add('assistant', finalText, undefined, model);
  void deps.fibeSync.syncMessages(JSON.stringify(deps.messageStore.all()));
  deps.send(WS_EVENT.THINKING_STEP, {
    id: stepId,
    title: step.title,
    status: 'complete',
    details: step.details,
    timestamp: new Date().toISOString(),
  });
  deps.send(WS_EVENT.STREAM_END, { ...(usage ? { usage } : {}), model });
  const currentId = deps.getCurrentActivityId();
  if (currentId && usage) {
    deps.activityStore.setUsage(currentId, usage);
    const entry = deps.activityStore.getById(currentId);
    if (entry) {
      deps.send(WS_EVENT.ACTIVITY_UPDATED, { entry });
    }
  }
  deps.clearLastStreamUsage();
}
