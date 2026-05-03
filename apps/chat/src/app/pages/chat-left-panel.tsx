import { memo } from 'react';
import { FileExplorer, type PlaygroundEntry } from '../file-explorer/file-explorer';
import type { FileTab, TabStats } from '../file-explorer/file-explorer-tabs';
import { SIDEBAR_COLLAPSED_WIDTH_PX } from '../layout-constants';
import { PanelResizeHandle } from '../panel-resize-handle';
import type { PanelResizeStartEvent } from '../use-panel-resize';
import { ConversationSidebar } from '../chat/conversation-sidebar';
import type { ConversationMeta } from '../chat/use-conversations';
import { SidebarToggle } from '../sidebar-toggle';
import { useT } from '../i18n';

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
  // Conversation sidebar — always shown when panel is open
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
  const t = useT();
  // Icon rail when user explicitly collapsed OR when there are no files and also
  // no conversations to show (edge case: conversations prop not provided).
  const isCollapsed = sidebarCollapsed || (!hasAnyFiles && !conversations);

  // Conversations are shown as long as the panel isn't in collapsed icon-rail mode
  // and the necessary props are wired up. When there are no files, conversations
  // take the full height so progress is always trackable.
  const showConversations = !isCollapsed && conversations !== undefined && !!onConversationSelect;

  const panelWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : width;

  return (
    <div
      ref={panelRef}
      className={`flex min-h-0 flex-shrink-0 flex-col overflow-visible${isDraggingResize ? '' : ' transition-[width] duration-300 ease-out'}`}
      style={{ width: panelWidth }}
    >
      {/* overflow-visible is required so the PanelResizeHandle and SidebarToggle render correctly */}
      <aside className="flex min-h-0 flex-1 flex-col overflow-visible relative border-r border-border/20">
        {/* File explorer — takes available space above conversations.
            hideSidebarToggle suppresses the toggle inside FileExplorer so we
            can render it here on the aside and center it over the full height. */}
        {(hasAnyFiles || isCollapsed) && (
          <div className="flex flex-1 flex-col overflow-hidden min-h-0">
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
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
              dirtyPaths={dirtyPaths}
              onPlaygroundUploaded={onPlaygroundUploaded}
              onAgentUploaded={onAgentUploaded}
              agentProviderLabel={agentProviderLabel}
              currentModel={currentModel}
            />
          </div>
        )}

        {/* Conversations — pinned to the bottom half of the panel */}
        {showConversations && (
          <div
            className="shrink-0 border-t border-border/30 overflow-hidden flex flex-col"
            style={{ height: hasAnyFiles ? '45%' : '100%', minHeight: 180 }}
          >
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

        {/* Collapse/expand toggle — absolute on the aside so it centers over
            the FULL panel height (file explorer + conversations combined) */}
        {hasAnyFiles && onToggleCollapse && (
          <SidebarToggle
            isCollapsed={isCollapsed}
            onClick={onToggleCollapse}
            side="left"
            ariaLabel={
              isCollapsed ? t('fileExplorer.expand') : t('fileExplorer.collapse')
            }
          />
        )}

        {/* Resize handle — must be inside overflow-visible aside */}
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
