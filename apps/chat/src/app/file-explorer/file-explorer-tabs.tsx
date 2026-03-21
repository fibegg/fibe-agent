import { FolderOpen, Cpu } from 'lucide-react';
import { CountUpNumber } from '../count-up-number';

export type FileTab = 'playground' | 'agent';

export interface TabStats {
  fileCount: number;
  totalLines: number;
}

interface FileExplorerTabsProps {
  activeTab: FileTab;
  onTabChange: (tab: FileTab) => void;
  playgroundStats?: TabStats;
  agentStats?: TabStats;
}

const TABS: { id: FileTab; label: string; Icon: typeof FolderOpen }[] = [
  { id: 'playground', label: 'Playground', Icon: FolderOpen },
  { id: 'agent', label: 'AI', Icon: Cpu },
];

export function FileExplorerTabs({
  activeTab,
  onTabChange,
  playgroundStats,
  agentStats,
}: FileExplorerTabsProps) {
  const statsMap: Record<FileTab, TabStats | undefined> = {
    playground: playgroundStats,
    agent: agentStats,
  };

  return (
    <div className="relative flex items-center gap-0.5 mx-2 mb-1.5 mt-0.5 rounded-md bg-muted/40 p-0.5">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const s = statsMap[tab.id];
        const hasStats = s && s.fileCount > 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={[
              'relative flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5',
              'text-[11px] font-semibold tracking-wide uppercase',
              'rounded-[5px] transition-all duration-200 ease-out',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground/80',
            ].join(' ')}
            aria-selected={isActive}
            role="tab"
          >
            <tab.Icon className="size-3.5 shrink-0" />
            <span>{tab.label}</span>
            {hasStats && (
              <span className={`text-[9px] font-medium tabular-nums ${isActive ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                <CountUpNumber value={s.fileCount} format="raw" />
                /
                <CountUpNumber value={s.totalLines} format="compact" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
