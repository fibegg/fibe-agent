import { memo } from 'react';
import { FileExplorer, type PlaygroundEntry } from '../file-explorer/file-explorer';
import type { FileTab, TabStats } from '../file-explorer/file-explorer-tabs';
import { SIDEBAR_COLLAPSED_WIDTH_PX } from '../layout-constants';
import { PanelResizeHandle } from '../panel-resize-handle';

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
  onResizeStart: (e: React.PointerEvent) => void;
  selectedPath: string | null;
  dirtyPaths: Set<string>;
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
