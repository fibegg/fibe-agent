import { memo } from 'react';
import { ThinkingTextWithHighlights } from './agent-thinking-blocks';
import {
  ACTIVITY_BLOCK_VARIANTS,
  ACTIVITY_BLOCK_BASE,
  ACTIVITY_MONO,
} from './ui-classes';

interface SidebarReasoningPanelProps {
  displayThinkingText: string;
  isStreaming: boolean;
  reasoningMaxHeightPx: number | null;
  thinkingScrollRef: React.RefObject<HTMLSpanElement | null>;
  latestActivityId?: string;
  onActivityClick?: (payload: { activityId: string; storyId?: string }) => void;
}

export const SidebarReasoningPanel = memo(function SidebarReasoningPanel({
  displayThinkingText,
  isStreaming,
  reasoningMaxHeightPx,
  thinkingScrollRef,
  latestActivityId,
  onActivityClick,
}: SidebarReasoningPanelProps) {
  if (!displayThinkingText && !isStreaming) return null;

  const content = (
    <div
      className={`${ACTIVITY_BLOCK_VARIANTS.reasoning} ${ACTIVITY_BLOCK_BASE} ${isStreaming ? 'animate-pulse' : ''} min-h-0 flex flex-col shrink-0`}
      style={reasoningMaxHeightPx != null ? { maxHeight: reasoningMaxHeightPx } : undefined}
    >
      <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide shrink-0">
        Response
      </p>
      <div className={`${ACTIVITY_MONO} flex-1 min-h-0 overflow-y-auto`}>
        <ThinkingTextWithHighlights
          text={displayThinkingText || (isStreaming ? '…' : '')}
        />
        <span
          ref={thinkingScrollRef}
          className="inline-block min-h-0"
          aria-hidden
        />
      </div>
    </div>
  );

  if (latestActivityId && onActivityClick) {
    return (
      <button
        type="button"
        onClick={() => onActivityClick({ activityId: latestActivityId })}
        className="w-full text-left cursor-pointer hover:ring-2 hover:ring-amber-500/30 rounded-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-amber-500/30"
      >
        {content}
      </button>
    );
  }

  return content;
});
