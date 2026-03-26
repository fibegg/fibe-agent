import { memo } from 'react';
import { FileExplorer, type PlaygroundEntry } from '../file-explorer/file-explorer';
import type { FileTab, TabStats } from '../file-explorer/file-explorer-tabs';
import { SIDEBAR_COLLAPSED_WIDTH_PX, SIDEBAR_WIDTH_PX } from '../layout-constants';

interface ChatLeftPanelProps {
  hasAnyFiles: boolean;
  sidebarCollapsed: boolean;
  playgroundTree: PlaygroundEntry[];
  agentFileTree: PlaygroundEntry[];
  activeFileTab: FileTab;
  onTabChange: (tab: FileTab) => void;
  playgroundStats?: TabStats;
  agentStats?: TabStats;
  onSettingsClick: () => void;
  onToggleCollapse: () => void;
  onFileSelect: (entry: PlaygroundEntry) => void;
  selectedPath: string | null;
  dirtyPaths: Set<string>;
}

export const ChatLeftPanel = memo(function ChatLeftPanel({
  hasAnyFiles,
  sidebarCollapsed,
  playgroundTree,
  agentFileTree,
  activeFileTab,
  onTabChange,
  playgroundStats,
  agentStats,
  onSettingsClick,
  onToggleCollapse,
  onFileSelect,
  selectedPath,
  dirtyPaths,
}: ChatLeftPanelProps) {
  return (
    <div
      className="flex min-h-0 flex-shrink-0 flex-col overflow-visible transition-[width] duration-300 ease-out"
      style={{
        width:
          !hasAnyFiles || sidebarCollapsed
            ? SIDEBAR_COLLAPSED_WIDTH_PX
            : SIDEBAR_WIDTH_PX,
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
          collapsed={!hasAnyFiles || sidebarCollapsed}
          onSettingsClick={onSettingsClick}
          onToggleCollapse={onToggleCollapse}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
          dirtyPaths={dirtyPaths}
        />
      </aside>
    </div>
  );
});
