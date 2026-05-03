import { memo } from 'react';
import { FileExplorer, type PlaygroundEntry } from '../file-explorer/file-explorer';
import type { FileTab, TabStats } from '../file-explorer/file-explorer-tabs';
import { SIDEBAR_COLLAPSED_WIDTH_PX } from '../layout-constants';
import { PanelResizeHandle } from '../panel-resize-handle';
import type { PanelResizeStartEvent } from '../use-panel-resize';
import { ConversationSidebar } from '../chat/conversation-sidebar';
import type { ConversationMeta } from '../chat/use-conversations';

interface ChatLeftPanelProps {
  hasAnyFiles: boolean;
  sidebarCollapsed: boolean;
  width: number;
  isDraggingResize?: boolean;
  panelRef: React.RefObject<HTMLDivElement | null>;
  playgroundTree: PlaygroundEntry[];
  agentFileTree: PlaygroundEntry[];
  activeFileTab: FileTab;
  onTabChange: (tab: FileTab) => void;
  playgroundStats?: TabStats;
  agentStats?: TabStats;
  onSettingsClick: () => void;
  onToggleCollapse: () => void;
  onFileSelect: (entry: PlaygroundEntry) => void;
  onResizeStart: (e: PanelResizeStartEvent) => void;
  selectedPath: string | null;
  dirtyPaths: Set<string>;
  onPlaygroundUploaded?: () => void;
  onAgentUploaded?: () => void;
  agentProviderLabel?: string;
  currentModel?: string;
  // Conversation sidebar
  conversations?: ConversationMeta[];
  conversationsLoading?: boolean;
  activeConversationId?: string;
  onConversationSelect?: (id: string) => void;
  onConversationCreate?: () => void;
  onConversationRename?: (id: string, title: string) => void;
  onConversationDelete?: (id: string) => void;
}

export const ChatLeftPanel = memo(function ChatLeftPanel({
  hasAnyFiles,
  sidebarCollapsed,
  width,
  isDraggingResize = false,
  panelRef,
  playgroundTree,
  agentFileTree,
  activeFileTab,
  onTabChange,
  playgroundStats,
  agentStats,
  onSettingsClick,
  onToggleCollapse,
  onFileSelect,
  onResizeStart,
  selectedPath,
  dirtyPaths,
  onPlaygroundUploaded,
  onAgentUploaded,
  agentProviderLabel,
  currentModel,
  conversations,
  conversationsLoading = false,
  activeConversationId = 'default',
  onConversationSelect,
  onConversationCreate,
  onConversationRename,
  onConversationDelete,
}: ChatLeftPanelProps) {
  const isCollapsed = !hasAnyFiles || sidebarCollapsed;
  return (
    <div
      ref={panelRef}
      className={`flex min-h-0 flex-shrink-0 flex-col overflow-visible${isDraggingResize ? '' : ' transition-[width] duration-300 ease-out'}`}
      style={{
        width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : width,
      }}
    >
      <aside className="flex min-h-0 flex-1 flex-col overflow-visible relative">
        {/* Conversation list — shown above file explorer when not collapsed */}
        {!isCollapsed && conversations !== undefined && onConversationSelect && (
          <div className="shrink-0 border-b border-border/30" style={{ maxHeight: '40%', overflowY: 'auto' }}>
            <ConversationSidebar
              conversations={conversations}
              activeId={activeConversationId}
              loading={conversationsLoading}
              onSelect={onConversationSelect}
              onCreate={onConversationCreate ?? (() => undefined)}
              onRename={onConversationRename ?? (() => undefined)}
              onDelete={onConversationDelete ?? (() => undefined)}
            />
          </div>
        )}
        <FileExplorer
          tree={playgroundTree}
          agentTree={agentFileTree}
          activeTab={activeFileTab}
          onTabChange={onTabChange}
          agentFileApiPath="agent-files/file"
          playgroundStats={playgroundStats}
          agentStats={agentStats}
          collapsed={isCollapsed}
          onSettingsClick={onSettingsClick}
          onToggleCollapse={onToggleCollapse}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
          dirtyPaths={dirtyPaths}
          onPlaygroundUploaded={onPlaygroundUploaded}
          onAgentUploaded={onAgentUploaded}
          agentProviderLabel={agentProviderLabel}
          currentModel={currentModel}
        />
        {!isCollapsed && (
          <PanelResizeHandle
            side="left"
            isDragging={isDraggingResize}
            onPointerDown={onResizeStart}
          />
        )}
      </aside>
    </div>
  );
});
