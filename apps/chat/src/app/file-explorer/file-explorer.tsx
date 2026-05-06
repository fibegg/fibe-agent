import { Search, Settings, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  INPUT_SEARCH,
  SEARCH_ICON_POSITION,
  SEARCH_ROW_WRAPPER,
} from '../ui-classes';
import { TreeNode } from './file-explorer-tree-node';
import type { PlaygroundEntry } from './file-explorer-types';
import {
  flattenTree,
  diffTrees,
  filterTreeByQuery,
  findEntryByPath,
  getDirPathsAtDepth,
  mergeAnimatingRemoved,
  type FileAnimationType,
} from './file-explorer-tree-utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileDetailsDialog } from './file-viewer-panel';
import { FileExplorerTabs, type FileTab, type TabStats } from './file-explorer-tabs';
import { useWorkspaceDrop } from './use-workspace-drop';
import { DragDropOverlay } from '../chat/drag-drop-overlay';
import { useT } from '../i18n';

export type { PlaygroundEntry } from './file-explorer-types';

const SIDEBAR_TITLE = 'Claude';
const SIDEBAR_SUBTITLE = `v${__APP_VERSION__}`;

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
  agentFileUploadApiPath,
  agentWorkspaceAvailable,
  playgroundStats,
  agentStats,
  dirtyPaths: dirtyPathsProp,
  onDirtyChange: onDirtyChangeProp,
  onPlaygroundUploaded,
  onAgentUploaded,
  agentProviderLabel,
  currentModel,
  playgroundSelector,
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
  agentFileUploadApiPath?: string;
  agentWorkspaceAvailable?: boolean;
  playgroundStats?: TabStats;
  agentStats?: TabStats;
  /** Externally-controlled dirty paths (from parent managing the editor inline) */
  dirtyPaths?: Set<string>;
  /** Callback for dirty state changes from the internal FileDetailsDialog */
  onDirtyChange?: (path: string, isDirty: boolean) => void;
  /** Called after files are uploaded to the playground via drag & drop */
  onPlaygroundUploaded?: () => void;
  /** Called after files are uploaded to the AI workspace via drag & drop */
  onAgentUploaded?: () => void;
  /** Agent provider label shown in the explorer header. */
  agentProviderLabel?: string;
  /** Active model shown as muted secondary text in the explorer header. */
  currentModel?: string;
  /** Optional playground selector rendered inside the file browser chrome. */
  playgroundSelector?: ReactNode;
} = {}) {
  const t = useT();
  const [internalTree, setInternalTree] = useState<PlaygroundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileLocal, setSelectedFileLocal] = useState<PlaygroundEntry | null>(null);
  const [animatingPaths, setAnimatingPaths] = useState<Map<string, FileAnimationType>>(new Map());
  const [animatingPrev, setAnimatingPrev] = useState<PlaygroundEntry[] | null>(null);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const prevTreeRef = useRef<PlaygroundEntry[]>([]);

  const controlled = isControlledTree(treeProp);
  const controlledAgent = isControlledTree(agentTreeProp);
  const titleLabel = agentProviderLabel?.trim() || SIDEBAR_TITLE;
  const modelLabel = currentModel?.trim() ?? '';
  const playgroundTree = controlled ? treeProp : internalTree;
  const agentTree = controlledAgent ? agentTreeProp : [];
  const loadingState = controlled ? false : loading;
  const hasAgentWorkspace = agentWorkspaceAvailable === true || agentTree.length > 0;

  const showTabs = playgroundTree.length > 0 && hasAgentWorkspace;
  const effectiveTab: FileTab =
    showTabs && activeTab ? activeTab
    : hasAgentWorkspace && playgroundTree.length === 0 ? 'agent'
    : 'playground';
  const tree = effectiveTab === 'agent' ? agentTree : playgroundTree;
  const agentFileContentApiPath = useMemo(() => {
    const raw = agentFileApiPath || API_PATHS.AGENT_FILES_FILE;
    if (raw.startsWith('/api/')) return raw;

    const normalized = raw.replace(/^\/+/, '');
    return normalized.startsWith('api/') ? `/${normalized}` : `/api/${normalized}`;
  }, [agentFileApiPath]);

  const selectedFile = selectedPathProp !== undefined
    ? (tree.length > 0 ? findEntryByPath(tree, selectedPathProp ?? '') : null)
    : selectedFileLocal;

  const [playgroundUrls, setPlaygroundUrls] = useState<string[]>([]);

  const fetchUrls = useCallback(async (signal?: AbortSignal) => {
    try {
      const urlsRes = await apiRequest('/api/playgrounds/urls', { signal }).catch(() => null);
      if (urlsRes?.ok) {
        const urlData = await urlsRes.json();
        setPlaygroundUrls(Array.isArray(urlData.urls) ? urlData.urls : []);
      }
    } catch {
      // ignore
    }
  }, []);

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
    void fetchUrls();
  }, [fetchUrls, playgroundTree]);

  useEffect(() => {
    if (controlled || refreshTrigger === undefined) return;
    void refetch();
    void fetchUrls();
  }, [controlled, refreshTrigger, refetch, fetchUrls]);

  useEffect(() => {
    if (controlled || internalTree.length > 0 || loading) return;
    const id = setInterval(() => {
      void refetch();
      void fetchUrls();
    }, REFETCH_WHEN_EMPTY_MS);
    return () => clearInterval(id);
  }, [controlled, internalTree.length, loading, refetch, fetchUrls]);

  const refetchRef = useRef(refetch);
  const fetchUrlsRef = useRef(fetchUrls);
  refetchRef.current = refetch;
  fetchUrlsRef.current = fetchUrls;
  useEffect(() => {
    if (controlled) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refetchRef.current();
        fetchUrlsRef.current();
      }
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
        onFileSelect({ ...entry, source: effectiveTab });
      } else {
        setSelectedFileLocal(entry);
      }
    },
    [effectiveTab, onFileSelect]
  );

  const handleDirtyChange = useCallback((path: string, isDirty: boolean) => {
    setDirtyPaths((prev) => {
      const next = new Set(prev);
      if (isDirty) next.add(path);
      else next.delete(path);
      return next;
    });
    onDirtyChangeProp?.(path, isDirty);
  }, [onDirtyChangeProp]);

  // Merge internal and externally-provided dirty paths
  const effectiveDirtyPaths = dirtyPathsProp && dirtyPathsProp.size > 0
    ? new Set([...dirtyPaths, ...dirtyPathsProp])
    : dirtyPaths;

  const displayTree = useMemo(() => {
    if (animatingPaths.size > 0 && animatingPrev) {
      return mergeAnimatingRemoved(animatingPrev, tree, animatingPaths);
    }
    return tree;
  }, [tree, animatingPaths, animatingPrev]);

  const filteredTree = useMemo(() => filterTreeByQuery(displayTree, searchQuery), [displayTree, searchQuery]);
  const flatTree = useMemo(() => flattenTree(filteredTree, expanded), [filteredTree, expanded]);

  // ── Workspace drop zones ──────────────────────────────────────────────────
  const playgroundDrop = useWorkspaceDrop({
    uploadUrl: API_PATHS.PLAYGROUNDS_UPLOAD,
    onUploaded: onPlaygroundUploaded,
    disabled: effectiveTab !== 'playground',
  });
  const agentDrop = useWorkspaceDrop({
    uploadUrl: agentFileUploadApiPath ?? API_PATHS.AGENT_FILES_UPLOAD,
    onUploaded: onAgentUploaded,
    disabled: effectiveTab !== 'agent',
  });
  const activeDrop = effectiveTab === 'agent' ? agentDrop : playgroundDrop;
  const dropLabel =
    effectiveTab === 'agent' ? t('fileExplorer.dropAgent') : t('fileExplorer.dropPlayground');

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatTree.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28, // 28px height per TreeNode
    overscan: 10,
  });

  const openFileEntry =
    !onFileSelect && selectedFile !== null && selectedFile.type === 'file' ? selectedFile : null;

  const collapsedContent = (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center border-r border-border/50 bg-card/30 pt-3 pb-4 backdrop-blur-xl">
      <div className="flex flex-col items-center gap-3">
        {playgroundSelector}
        <button
          type="button"
          className={`${BUTTON_ICON_ACCENT} size-9`}
          title={t('fileExplorer.settings')}
          aria-label={t('fileExplorer.settings')}
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
        className={`border-b border-border/50 bg-gradient-to-br from-violet-500/10 via-transparent to-purple-500/5 backdrop-blur-sm shrink-0 px-4 pb-3`}
        style={{ minHeight: PANEL_HEADER_MIN_HEIGHT_PX, paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}
      >
        <div className={`flex items-center justify-between ${HEADER_FIRST_ROW}`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <div className="flex min-w-0 items-baseline gap-2">
                <h2 className="font-semibold text-xs sm:text-sm text-foreground truncate" title={titleLabel}>
                  {titleLabel}
                </h2>
                {modelLabel && (
                  <span
                    className="max-w-28 truncate text-[10px] font-medium leading-none text-muted-foreground/70 sm:max-w-40 sm:text-[11px]"
                    title={t('header.modelTitle', { model: modelLabel })}
                  >
                    {modelLabel}
                  </span>
                )}
              </div>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">{SIDEBAR_SUBTITLE}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {playgroundSelector && <div className="shrink-0">{playgroundSelector}</div>}
            <button
              type="button"
              className={BUTTON_ICON_ACCENT_SM}
              title={t('fileExplorer.settings')}
              aria-label={t('fileExplorer.settings')}
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
                aria-label={t('common.close')}
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
            placeholder={t('fileExplorer.searchPlaceholder')}
            className={INPUT_SEARCH}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className={CLEAR_BUTTON_POSITION}
              aria-label={t('fileExplorer.clearSearch')}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col pt-2">
        {showTabs && onTabChange && (
          <div className="shrink-0 mb-2">
            <FileExplorerTabs
              activeTab={effectiveTab}
              onTabChange={onTabChange}
              playgroundStats={playgroundStats}
              agentStats={agentStats}
            />
          </div>
        )}
        {effectiveTab === 'playground' && playgroundUrls?.length > 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
            {playgroundUrls.map((urlStr) => {
              const [name, rawUrl] = urlStr.includes('|') ? urlStr.split('|') : [urlStr, urlStr];
              const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
              return (
                <a
                  key={urlStr}
                  href={fullUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors border border-blue-500/20 shadow-sm"
                >
                  <div className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex size-1.5 rounded-full bg-blue-500"></span>
                  </div>
                  {name}
                </a>
              );
            })}
          </div>
        )}
        <div
          className="relative flex-1 overflow-auto pb-2"
          ref={parentRef}
          {...activeDrop.dragHandlers}
        >
          {activeDrop.isDragOver && <DragDropOverlay label={dropLabel} />}
          {loadingState && tree.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t('fileExplorer.loading')}
            </div>
          )}
          {error && (
            <div className="px-3 py-2 text-xs text-destructive">{error}</div>
          )}
          {!loadingState && !error && tree.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {effectiveTab === 'agent' ? t('fileExplorer.emptyAgent') : t('fileExplorer.emptyPlayground')}
            </div>
          )}
          {!error && tree.length > 0 && filteredTree.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t('fileExplorer.noMatches', { query: searchQuery })}
            </div>
          )}
          {!error && filteredTree.length > 0 && (
            <div className="p-2 animate-file-explorer-in">
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const { entry, depth } = flatTree[virtualItem.index];
                  return (
                    <div
                      key={entry.path}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <TreeNode
                        entry={entry}
                        depth={depth}
                        isExpanded={expanded.has(entry.path)}
                        isSelected={selectedPathProp !== undefined ? selectedPathProp === entry.path : openFileEntry?.path === entry.path}
                        isDirty={effectiveDirtyPaths?.has(entry.path) ?? false}
                        animType={animatingPaths.get(entry.path)}
                        onToggle={handleToggle}
                        onFileClick={handleFileClick}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const content = collapsed ? collapsedContent : expandedContent;

  return (
    <>
      {onToggleCollapse && collapsed !== undefined && (playgroundTree.length > 0 || hasAgentWorkspace) ? (
        <div className="relative h-full flex flex-col min-h-0 flex-1">
          {content}
          <SidebarToggle
            isCollapsed={collapsed}
            onClick={onToggleCollapse}
            side="left"
            ariaLabel={
              collapsed ? t('fileExplorer.expand') : t('fileExplorer.collapse')
            }
          />
        </div>
      ) : (
        content
      )}
      {openFileEntry && (
        <FileDetailsDialog
          entry={openFileEntry}
          onClose={() => setSelectedFileLocal(null)}
          apiBasePath={effectiveTab === 'agent' ? agentFileContentApiPath : undefined}
          onDirtyChange={handleDirtyChange}
        />
      )}
    </>
  );
}
