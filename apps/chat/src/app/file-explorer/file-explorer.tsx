import { Search, Settings, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_PATHS } from '@shared/api-paths';
import { apiRequest } from '../api-url';
import { PANEL_HEADER_MIN_HEIGHT_PX, REFETCH_WHEN_EMPTY_MS } from '../layout-constants';
import { shouldHideThemeSwitch } from '../embed-config';
import { SidebarToggle } from '../sidebar-toggle';
import { ThemeToggle } from '../theme-toggle';
import {
  BUTTON_ICON_ACCENT,
  BUTTON_ICON_ACCENT_SM,
  BUTTON_ICON_MUTED,
  CLEAR_BUTTON_POSITION,
  HEADER_FIRST_ROW,
  HEADER_PADDING,
  INPUT_SEARCH,
  SEARCH_ICON_POSITION,
  SEARCH_ROW_WRAPPER,
} from '../ui-classes';
import { TreeNode } from './file-explorer-tree-node';
import type { PlaygroundEntry } from './file-explorer-types';
import {
  diffTrees,
  filterTreeByQuery,
  findEntryByPath,
  getDirPathsAtDepth,
  mergeAnimatingRemoved,
  type FileAnimationType,
} from './file-explorer-tree-utils';
import { FileDetailsDialog } from './file-viewer-panel';
import { FileExplorerTabs, type FileTab, type TabStats } from './file-explorer-tabs';

export type { PlaygroundEntry } from './file-explorer-types';

const SIDEBAR_TITLE = 'Standalone';
const SIDEBAR_SUBTITLE = `v${__APP_VERSION__}`;
const EMPTY_PLAYGROUND_MESSAGE = "You don't have any files in the playground.";

const isControlledTree = (t: PlaygroundEntry[] | null | undefined): t is PlaygroundEntry[] =>
  Array.isArray(t);

export function FileExplorer({
  collapsed,
  onSettingsClick,
  onClose,
  onToggleCollapse,
  onFileSelect,
  selectedPath: selectedPathProp,
  refreshTrigger,
  tree: treeProp,
  agentTree: agentTreeProp,
  activeTab,
  onTabChange,
  agentFileApiPath,
  playgroundStats,
  agentStats,
}: {
  collapsed?: boolean;
  onSettingsClick?: () => void;
  onClose?: () => void;
  onToggleCollapse?: () => void;
  onFileSelect?: (entry: PlaygroundEntry) => void;
  selectedPath?: string | null;
  refreshTrigger?: number;
  tree?: PlaygroundEntry[] | null;
  agentTree?: PlaygroundEntry[] | null;
  activeTab?: FileTab;
  onTabChange?: (tab: FileTab) => void;
  agentFileApiPath?: string;
  playgroundStats?: TabStats;
  agentStats?: TabStats;
} = {}) {
  const [internalTree, setInternalTree] = useState<PlaygroundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileLocal, setSelectedFileLocal] = useState<PlaygroundEntry | null>(null);
  const [animatingPaths, setAnimatingPaths] = useState<Map<string, FileAnimationType>>(new Map());
  const [animatingPrev, setAnimatingPrev] = useState<PlaygroundEntry[] | null>(null);
  const prevTreeRef = useRef<PlaygroundEntry[]>([]);

  const controlled = isControlledTree(treeProp);
  const controlledAgent = isControlledTree(agentTreeProp);
  const playgroundTree = controlled ? treeProp : internalTree;
  const agentTree = controlledAgent ? agentTreeProp : [];
  const loadingState = controlled ? false : loading;

  const showTabs = playgroundTree.length > 0 && agentTree.length > 0;
  const effectiveTab: FileTab =
    showTabs && activeTab ? activeTab
    : agentTree.length > 0 && playgroundTree.length === 0 ? 'agent'
    : 'playground';
  const tree = effectiveTab === 'agent' ? agentTree : playgroundTree;

  const selectedFile = selectedPathProp !== undefined
    ? (tree.length > 0 ? findEntryByPath(tree, selectedPathProp ?? '') : null)
    : selectedFileLocal;

  const refetch = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await apiRequest(API_PATHS.PLAYGROUNDS, { signal });
      if (res.status === 401) {
        setInternalTree([]);
        return;
      }
      if (!res.ok) throw new Error('Failed to load playgrounds');
      const data = (await res.json()) as PlaygroundEntry[];
      const list = Array.isArray(data) ? data : [];
      setInternalTree(list);
      setError(null);
      if (list.length > 0) {
        setExpanded((prev) => new Set(getDirPathsAtDepth(list, 0)));
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setInternalTree([]);
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (controlled) return;
    const ac = new AbortController();
    void refetch(ac.signal);
    return () => ac.abort();
  }, [controlled, refetch]);

  useEffect(() => {
    if (controlled || refreshTrigger === undefined) return;
    void refetch();
  }, [controlled, refreshTrigger, refetch]);

  useEffect(() => {
    if (controlled || internalTree.length > 0 || loading) return;
    const id = setInterval(() => void refetch(), REFETCH_WHEN_EMPTY_MS);
    return () => clearInterval(id);
  }, [controlled, internalTree.length, loading, refetch]);

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    if (controlled) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetchRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [controlled]);

  const hasSetInitialExpand = useRef(false);
  useEffect(() => {
    if (!controlled || !treeProp?.length || hasSetInitialExpand.current) return;
    hasSetInitialExpand.current = true;
    setExpanded(new Set(getDirPathsAtDepth(treeProp, 0)));
  }, [controlled, treeProp]);

  useEffect(() => {
    const prev = prevTreeRef.current;
    prevTreeRef.current = tree;
    if (prev.length === 0 || tree.length === 0) return;
    const diff = diffTrees(prev, tree);
    if (diff.size === 0) return;
    setAnimatingPaths(diff);
    setAnimatingPrev(prev);

    setExpanded((currentExpanded) => {
      let changed = false;
      const nextExpanded = new Set(currentExpanded);
      for (const [p, type] of diff.entries()) {
        if (type === 'added' || type === 'modified') {
          const parts = p.split('/');
          let currentPath = '';
          for (let i = 0; i < parts.length - 1; i++) {
            currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
            if (!nextExpanded.has(currentPath)) {
              nextExpanded.add(currentPath);
              changed = true;
            }
          }
        }
      }
      return changed ? nextExpanded : currentExpanded;
    });

    const timer = setTimeout(() => {
      setAnimatingPaths(new Map());
      setAnimatingPrev(null);
    }, 600);
    return () => clearTimeout(timer);
  }, [tree]);

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleFileClick = useCallback(
    (entry: PlaygroundEntry) => {
      if (entry.type !== 'file') return;
      if (onFileSelect) {
        onFileSelect(entry);
      } else {
        setSelectedFileLocal(entry);
      }
    },
    [onFileSelect]
  );

  const displayTree = useMemo(() => {
    if (animatingPaths.size > 0 && animatingPrev) {
      return mergeAnimatingRemoved(animatingPrev, tree, animatingPaths);
    }
    return tree;
  }, [tree, animatingPaths, animatingPrev]);

  const filteredTree = useMemo(() => filterTreeByQuery(displayTree, searchQuery), [displayTree, searchQuery]);
  const openFileEntry =
    !onFileSelect && selectedFile !== null && selectedFile.type === 'file' ? selectedFile : null;

  const collapsedContent = (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center border-r border-border/50 bg-card/30 pt-3 pb-4 backdrop-blur-xl">
      <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            className={`${BUTTON_ICON_ACCENT} size-9`}
            title="Settings"
            aria-label="Settings"
            onClick={onSettingsClick}
          >
            <Settings className="size-4" />
          </button>
          {!shouldHideThemeSwitch() && <ThemeToggle />}
        </div>
    </div>
  );

  const expandedContent = (
    <div className="min-h-0 flex w-full flex-1 flex-col bg-card/30 backdrop-blur-xl border-r border-border/50">
      <div
        className={`border-b border-border/50 bg-gradient-to-br from-violet-500/10 via-transparent to-purple-500/5 backdrop-blur-sm shrink-0 ${HEADER_PADDING}`}
        style={{ minHeight: PANEL_HEADER_MIN_HEIGHT_PX }}
      >
        <div className={`flex items-center justify-between ${HEADER_FIRST_ROW}`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <h2 className="font-semibold text-xs sm:text-sm text-foreground">{SIDEBAR_TITLE}</h2>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">{SIDEBAR_SUBTITLE}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={BUTTON_ICON_ACCENT_SM}
              title="Settings"
              aria-label="Settings"
              onClick={onSettingsClick}
            >
              <Settings className="size-3.5 sm:size-4" />
            </button>
            {!shouldHideThemeSwitch() && <ThemeToggle />}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className={`${BUTTON_ICON_MUTED} size-7 sm:size-8`}
                aria-label="Close"
              >
                <X className="size-3.5 sm:size-4" />
              </button>
            )}
          </div>
        </div>
        <div className={SEARCH_ROW_WRAPPER}>
          <Search className={SEARCH_ICON_POSITION} aria-hidden />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className={INPUT_SEARCH}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className={CLEAR_BUTTON_POSITION}
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto py-2">
        {showTabs && onTabChange && (
          <FileExplorerTabs
            activeTab={effectiveTab}
            onTabChange={onTabChange}
            playgroundStats={playgroundStats}
            agentStats={agentStats}
          />
        )}
        {loadingState && tree.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Loading…
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-xs text-destructive">{error}</div>
        )}
        {!loadingState && !error && tree.length === 0 && (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            {EMPTY_PLAYGROUND_MESSAGE}
          </div>
        )}
        {!error && tree.length > 0 && filteredTree.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No matches for &quot;{searchQuery}&quot;
          </div>
        )}
        {!error && filteredTree.length > 0 && (
          <div className="p-2 animate-file-explorer-in">
            {filteredTree.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                expanded={expanded}
                onToggle={handleToggle}
                onFileClick={handleFileClick}
                selectedPath={selectedPathProp ?? openFileEntry?.path ?? null}
                animatingPaths={animatingPaths}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const content = collapsed ? collapsedContent : expandedContent;

  return (
    <>
      {onToggleCollapse && collapsed !== undefined && (playgroundTree.length > 0 || agentTree.length > 0) ? (
        <div className="relative h-full flex flex-col min-h-0 flex-1">
          {content}
          <SidebarToggle
            isCollapsed={collapsed}
            onClick={onToggleCollapse}
            side="left"
            ariaLabel={
              collapsed ? 'Expand file explorer' : 'Collapse file explorer'
            }
          />
        </div>
      ) : (
        content
      )}
      {openFileEntry && (
        <FileDetailsDialog entry={openFileEntry} onClose={() => setSelectedFileLocal(null)} />
      )}
    </>
  );
}
