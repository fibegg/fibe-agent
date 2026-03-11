import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsRight,
  Code,
  File,
  FileText,
  Folder,
  FolderOpen,
  Image,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { getApiUrl, getAuthTokenForRequest } from '../api-url';
import { AnimatedPhoenixLogo } from '../animated-phoenix-logo';
import { ThemeToggle } from '../theme-toggle';

export interface PlaygroundEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: PlaygroundEntry[];
}

const PLAYGROUNDS_LABEL = 'playground/';
const SIDEBAR_TITLE = 'Quantum Storage';
const SIDEBAR_SUBTITLE = 'Phoenix v2.4.1';

function getAllDirPaths(entries: PlaygroundEntry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e.type === 'directory') {
      out.push(e.path);
      if (e.children?.length) out.push(...getAllDirPaths(e.children));
    }
  }
  return out;
}

function getDirPathsAtDepth(entries: PlaygroundEntry[], depth: number): string[] {
  if (depth === 0) {
    return entries.filter((e) => e.type === 'directory').map((e) => e.path);
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.type === 'directory' && e.children?.length) {
      if (depth === 1) {
        e.children.filter((c) => c.type === 'directory').forEach((c) => out.push(c.path));
      } else {
        out.push(...getDirPathsAtDepth(e.children, depth - 1));
      }
    }
  }
  return out;
}

function filterTreeByQuery(entries: PlaygroundEntry[], query: string): PlaygroundEntry[] {
  if (!query.trim()) return entries;
  const lower = query.trim().toLowerCase();
  function build(entry: PlaygroundEntry): PlaygroundEntry | null {
    if (entry.type === 'file') {
      return entry.name.toLowerCase().includes(lower) ? entry : null;
    }
    const childResults = (entry.children ?? [])
      .map(build)
      .filter((c): c is PlaygroundEntry => c != null);
    if (entry.name.toLowerCase().includes(lower) || childResults.length > 0) {
      return { ...entry, children: childResults.length ? childResults : entry.children };
    }
    return null;
  }
  return entries.map(build).filter((e): e is PlaygroundEntry => e != null);
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html']);
const DOC_EXT = new Set(['.md', '.mdx', '.txt']);

const FILE_TYPE_COLOR = {
  image: 'text-pink-400',
  code: 'text-green-400',
  doc: 'text-blue-400',
  file: 'text-muted-foreground',
} as const;

function getFileIconAndColor(name: string): { Icon: typeof File; color: string } {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (IMAGE_EXT.has(ext)) return { Icon: Image, color: FILE_TYPE_COLOR.image };
  if (CODE_EXT.has(ext)) return { Icon: Code, color: FILE_TYPE_COLOR.code };
  if (DOC_EXT.has(ext)) return { Icon: FileText, color: FILE_TYPE_COLOR.doc };
  return { Icon: File, color: FILE_TYPE_COLOR.file };
}

function getFileKindLabel(name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (IMAGE_EXT.has(ext)) return 'Image';
  if (CODE_EXT.has(ext)) return 'Code';
  if (DOC_EXT.has(ext)) return 'Document';
  return 'File';
}

function getFileExtension(name: string): string {
  if (!name.includes('.')) return '—';
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

function FileTypeIcon({ name }: { name: string }) {
  const { Icon, color } = getFileIconAndColor(name);
  return <Icon className={`size-3.5 shrink-0 ${color}`} aria-hidden />;
}

function FileDetailsDialog({
  entry,
  onClose,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const { Icon, color } = getFileIconAndColor(entry.name);
  const kind = getFileKindLabel(entry.name);
  const extension = getFileExtension(entry.name);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-[95vw] sm:max-w-[90vw] sm:w-[90vw] h-[85vh] sm:h-[90vh] max-h-[calc(100vh-2rem)] bg-background/95 dark:bg-[#0f0f14]/95 backdrop-blur-xl border border-violet-500/30 rounded-xl shadow-[0_0_50px_rgba(139,92,246,0.2)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 border-b border-border-subtle bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-violet-500/10 backdrop-blur-sm shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 sm:gap-4 min-w-0">
              <div className="size-10 sm:size-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0">
                <Sparkles className="size-5 sm:size-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 sm:gap-3">
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">File details</h2>
                  <button
                    type="button"
                    onClick={onClose}
                    className="size-8 rounded-full hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mt-1 truncate" title={entry.name}>
                  {entry.name}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden min-h-0">
          <div className="flex-1 flex flex-col border-b sm:border-b-0 sm:border-r border-border-subtle min-h-0">
            <div className="px-4 py-3 border-b border-border-subtle bg-muted/30 backdrop-blur-sm shrink-0">
              <h3 className="text-sm font-medium text-foreground">File info</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Metadata for selected file</p>
            </div>
            <div className="flex-1 overflow-auto min-h-0 p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-muted/50">
                  <Icon className={`size-5 ${color}`} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate" title={entry.name}>
                    {entry.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate font-mono" title={entry.path}>
                    {entry.path}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-xs">
                <dt className="text-muted-foreground">Kind</dt>
                <dd className="text-foreground">{kind}</dd>
                <dt className="text-muted-foreground">Type</dt>
                <dd className="text-foreground">File</dd>
                <dt className="text-muted-foreground">Extension</dt>
                <dd className="text-foreground font-mono">{extension}</dd>
                <dt className="text-muted-foreground">Path</dt>
                <dd className="text-foreground font-mono truncate" title={entry.path}>
                  {entry.path}
                </dd>
              </dl>
            </div>
          </div>

          <div className="w-full sm:w-96 flex flex-col min-h-0 min-w-0 bg-card/20 backdrop-blur-sm shrink-0 sm:shrink">
            <div className="px-4 py-3 border-b border-border-subtle bg-gradient-to-r from-violet-500/10 to-purple-500/10 backdrop-blur-sm shrink-0">
              <h3 className="text-sm font-medium text-foreground">Preview</h3>
              <p className="text-xs text-muted-foreground mt-0.5">File content</p>
            </div>
            <div className="flex-1 overflow-auto min-h-0 p-4">
              <div className="rounded-xl border border-border-subtle bg-muted/20 backdrop-blur-sm p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Content preview is not available for this file.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  File content can be loaded when an API is connected.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  entry,
  depth,
  expanded,
  onToggle,
  onFileClick,
}: {
  entry: PlaygroundEntry;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onFileClick?: (entry: PlaygroundEntry) => void;
}) {
  const isDir = entry.type === 'directory';
  const isOpen = expanded.has(entry.path);
  const hasChildren = isDir && (entry.children?.length ?? 0) > 0;

  const handleClick = useCallback(() => {
    if (isDir) {
      onToggle(entry.path);
    } else if (onFileClick) {
      onFileClick(entry);
    }
  }, [isDir, entry, onToggle, onFileClick]);

  return (
    <div className="select-none group">
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs rounded-md cursor-pointer transition-all hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30 focus:bg-violet-500/5"
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
      >
        <span className="w-3 flex shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
          {isDir && hasChildren ? (
            isOpen ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )
          ) : (
            <span className="w-3" />
          )}
        </span>
        {isDir ? (
          isOpen ? (
            <FolderOpen className="size-3.5 shrink-0 text-violet-400" aria-hidden />
          ) : (
            <Folder className="size-3.5 shrink-0 text-violet-400" aria-hidden />
          )
        ) : (
          <FileTypeIcon name={entry.name} />
        )}
        <span className="min-w-0 flex-1 truncate text-foreground">{entry.name}</span>
      </button>
      {isDir && hasChildren && isOpen && (
        <div>
          {(entry.children ?? []).map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({ fullWidth }: { fullWidth?: boolean } = {}) {
  const [tree, setTree] = useState<PlaygroundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<PlaygroundEntry | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const base = getApiUrl();
    const url = base ? `${base}/api/playgrounds` : '/api/playgrounds';
    const token = getAuthTokenForRequest();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    (async () => {
      try {
        const res = await fetch(url, { headers, signal: ac.signal });
        if (res.status === 401) {
          setTree([]);
          return;
        }
        if (!res.ok) throw new Error('Failed to load playgrounds');
        const data = (await res.json()) as PlaygroundEntry[];
        setTree(Array.isArray(data) ? data : []);
        setError(null);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setTree([]);
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandOneLevel = useCallback(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      getDirPathsAtDepth(tree, 1).forEach((p) => next.add(p));
      return next;
    });
  }, [tree]);

  const collapseOneLevel = useCallback(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      getDirPathsAtDepth(tree, 1).forEach((p) => next.delete(p));
      return next;
    });
  }, [tree]);

  const expandAll = useCallback(() => {
    setExpanded(new Set(getAllDirPaths(tree)));
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const handleFileClick = useCallback((entry: PlaygroundEntry) => {
    if (entry.type === 'file') setSelectedFile(entry);
  }, []);

  const filteredTree = filterTreeByQuery(tree, searchQuery);

  const toolbarBtnClass =
    'rounded-md text-[9px] sm:text-[10px] font-medium text-white hover:bg-violet-500/10 hover:text-violet-400 transition-colors';

  return (
    <>
      <div
        className="min-h-0 flex w-full flex-1 flex-col border-r border-border-subtle bg-card/30 backdrop-blur-xl"
      >
      <div className="p-3 sm:p-4 border-b border-border-subtle bg-gradient-to-br from-violet-500/10 via-transparent to-purple-500/5 backdrop-blur-sm shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AnimatedPhoenixLogo className="size-7 sm:size-8 text-violet-500" />
            <div>
              <h2 className="font-semibold text-xs sm:text-sm text-foreground">{SIDEBAR_TITLE}</h2>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">{SIDEBAR_SUBTITLE}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="size-7 sm:size-8 flex items-center justify-center rounded-md text-violet-400 hover:bg-violet-500/10 transition-colors"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="size-3.5 sm:size-4" />
            </button>
            <ThemeToggle />
          </div>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 sm:size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className={`w-full h-7 sm:h-8 pl-7 sm:pl-8 text-[11px] sm:text-xs rounded-md bg-input-bg border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-500/30 dark:focus:border-primary focus:ring-2 focus:ring-violet-500/20 dark:focus:ring-primary/30 ${searchQuery ? 'pr-7 sm:pr-8' : 'pr-2'}`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded p-0.5"
              aria-label="Clear search"
            >
              <X className="size-3 sm:size-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={expandOneLevel}
            className={`flex-1 min-w-0 h-6 sm:h-7 flex items-center justify-center gap-1 px-2 ${toolbarBtnClass}`}
          >
            <ChevronsDown className="size-2.5 sm:size-3 shrink-0 mr-1" />
            <span className="truncate">Expand<span className="hidden sm:inline"> Level</span></span>
          </button>
          <button
            type="button"
            onClick={collapseOneLevel}
            className={`flex-1 min-w-0 h-6 sm:h-7 flex items-center justify-center gap-1 px-2 ${toolbarBtnClass}`}
          >
            <ChevronsRight className="size-2.5 sm:size-3 shrink-0 mr-1" />
            <span className="truncate">Collapse<span className="hidden sm:inline"> Level</span></span>
          </button>
          <button
            type="button"
            onClick={expandAll}
            className={`h-7 flex items-center justify-center px-2 text-[10px] ${toolbarBtnClass}`}
            title="Expand All"
            aria-label="Expand all"
          >
            <ChevronsDown className="size-3" />
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className={`h-7 flex items-center justify-center px-2 text-[10px] ${toolbarBtnClass}`}
            title="Collapse All"
            aria-label="Collapse all"
          >
            <ChevronsRight className="size-3" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-2">
        {loading && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Loading…
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-xs text-destructive">{error}</div>
        )}
        {!loading && !error && tree.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No files in {PLAYGROUNDS_LABEL}
          </div>
        )}
        {!loading && !error && tree.length > 0 && filteredTree.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No matches for &quot;{searchQuery}&quot;
          </div>
        )}
        {!loading && !error && filteredTree.length > 0 && (
          <div className="p-2">
            <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">{PLAYGROUNDS_LABEL}</div>
            {filteredTree.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                expanded={expanded}
                onToggle={handleToggle}
                onFileClick={handleFileClick}
              />
            ))}
          </div>
        )}
      </div>
      </div>
      {selectedFile?.type === 'file' && (
        <FileDetailsDialog entry={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </>
  );
}
