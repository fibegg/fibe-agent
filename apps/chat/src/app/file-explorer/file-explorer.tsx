import { useCallback, useEffect, useState } from 'react';
import { getApiUrl, getAuthTokenForRequest } from '../api-url';
import { AnimatedPhoenixLogo } from '../animated-phoenix-logo';
import { ThemeToggle } from '../theme-toggle';
import { SIDEBAR_WIDTH_PX } from '../layout-constants';

export interface PlaygroundEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: PlaygroundEntry[];
}

const PLAYGROUNDS_LABEL = 'playground/';
const SIDEBAR_TITLE = 'Quantum Storage';
const SIDEBAR_SUBTITLE = 'Phoenix v2.4.1';
const INDENT_BASE_PX = 8;
const INDENT_PER_LEVEL_PX = 12;

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

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 text-violet-400"
      aria-hidden
    >
      {open ? (
        <>
          <path
            d="M2 4h4l2 2h6v6H2V4z"
            fill="currentColor"
            opacity={0.4}
          />
          <path
            d="M2 4v8h12V6H8L6 4H2z"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
        </>
      ) : (
        <>
          <path
            d="M2 5h4l2 2h6v5H2V5z"
            fill="currentColor"
            opacity={0.4}
          />
          <path
            d="M2 5v6h12V7H8L6 5H2z"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
        </>
      )}
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 text-muted-foreground"
      aria-hidden
    >
      <path
        d="M4 2h6l4 4v8H4V2z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

function TreeNode({
  entry,
  depth,
  expanded,
  onToggle,
}: {
  entry: PlaygroundEntry;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isDir = entry.type === 'directory';
  const isOpen = expanded.has(entry.path);
  const hasChildren = isDir && (entry.children?.length ?? 0) > 0;

  const handleClick = useCallback(() => {
    if (isDir) onToggle(entry.path);
  }, [isDir, entry.path, onToggle]);

  return (
    <div className="select-none group">
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center gap-1.5 py-1 px-2 text-left text-xs rounded-md cursor-pointer transition-all hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30 focus:bg-violet-500/5"
        style={{ paddingLeft: `${INDENT_BASE_PX + depth * INDENT_PER_LEVEL_PX}px` }}
      >
        <span className="w-3 flex items-center justify-center shrink-0 text-muted-foreground" aria-hidden>
          {isDir && hasChildren && (
            <span
              style={{
                transform: isOpen ? 'rotate(90deg)' : 'none',
                display: 'inline-block',
              }}
            >
              ▶
            </span>
          )}
        </span>
        {isDir ? (
          <FolderIcon open={isOpen} />
        ) : (
          <FileIcon />
        )}
        <span className="truncate text-foreground">{entry.name}</span>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function FileExplorer() {
  const [tree, setTree] = useState<PlaygroundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredTree = filterTreeByQuery(tree, searchQuery);

  return (
    <div
      className="min-h-0 flex flex-1 flex-col border-r border-border/50 bg-card/30 backdrop-blur-xl"
      style={{ width: SIDEBAR_WIDTH_PX, minWidth: SIDEBAR_WIDTH_PX }}
    >
      <div className="p-3 sm:p-4 border-b border-border/50 bg-gradient-to-br from-violet-500/10 via-transparent to-purple-500/5 backdrop-blur-sm shrink-0">
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
              className="size-7 sm:size-8 flex items-center justify-center rounded-lg text-violet-400 hover:bg-violet-500/10 transition-colors"
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon className="size-3.5 sm:size-4" />
            </button>
            <ThemeToggle />
          </div>
        </div>
        <div className="relative mb-2">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full h-7 sm:h-8 pl-7 sm:pl-8 pr-2 text-[11px] sm:text-xs rounded-md bg-background/50 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/30 focus:border-violet-500/30"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={expandOneLevel}
            className="flex-1 min-w-0 h-6 sm:h-7 flex items-center justify-center gap-1 rounded text-[9px] sm:text-[10px] text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 transition-colors px-2"
          >
            <ChevronDownIcon className="size-2.5 sm:size-3 shrink-0 mr-1" />
            <span className="truncate">Expand<span className="hidden sm:inline"> Level</span></span>
          </button>
          <button
            type="button"
            onClick={collapseOneLevel}
            className="flex-1 min-w-0 h-6 sm:h-7 flex items-center justify-center gap-1 rounded text-[9px] sm:text-[10px] text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 transition-colors px-2"
          >
            <ChevronRightIcon className="size-2.5 sm:size-3 shrink-0 mr-1" />
            <span className="truncate">Collapse<span className="hidden sm:inline"> Level</span></span>
          </button>
          <button
            type="button"
            onClick={expandAll}
            className="h-6 sm:h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 transition-colors"
            title="Expand all"
            aria-label="Expand all"
          >
            <ChevronDownIcon className="size-3" />
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="h-6 sm:h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 transition-colors"
            title="Collapse all"
            aria-label="Collapse all"
          >
            <ChevronRightIcon className="size-3" />
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
          <div className="py-1 px-2">
            <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">{PLAYGROUNDS_LABEL}</div>
            {filteredTree.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                expanded={expanded}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
