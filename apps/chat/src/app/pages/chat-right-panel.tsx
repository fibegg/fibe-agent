import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentThinkingSidebar } from '../agent-thinking-sidebar';
import { getActivityPath } from '../activity-path';
import type { StoryEntry, SessionActivityEntry } from '../agent-thinking-blocks';
import type { ThinkingStep } from '../chat/thinking-types';

interface ChatRightPanelProps {
  rightSidebarCollapsed: boolean;
  onToggle: () => void;
  isStreaming: boolean;
  reasoningText: string;
  streamingResponseText: string;
  thinkingSteps: ThinkingStep[];
  storyItems: StoryEntry[];
  sessionActivity: SessionActivityEntry[];
  pastActivityFromMessages: SessionActivityEntry[];
  sessionTokenUsage: { inputTokens: number; outputTokens: number } | null;
}

export const ChatRightPanel = memo(function ChatRightPanel({
  rightSidebarCollapsed,
  onToggle,
  isStreaming,
  reasoningText,
  streamingResponseText,
  thinkingSteps,
  storyItems,
  sessionActivity,
  pastActivityFromMessages,
  sessionTokenUsage,
}: ChatRightPanelProps) {
  const navigate = useNavigate();

  return (
    <AgentThinkingSidebar
      isCollapsed={rightSidebarCollapsed}
      onToggle={onToggle}
      isStreaming={isStreaming}
      reasoningText={reasoningText}
      streamingResponseText={streamingResponseText}
      thinkingSteps={thinkingSteps}
      storyItems={storyItems}
      sessionActivity={sessionActivity}
      pastActivityFromMessages={pastActivityFromMessages}
      sessionTokenUsage={sessionTokenUsage}
      onActivityClick={(payload) => navigate(getActivityPath(payload))}
    />
  );
});
