import { useCallback, useEffect, useState } from 'react';
import { getApiUrl, getAuthTokenForRequest } from '../api-url';
import { SIDEBAR_WIDTH_PX } from '../layout-constants';

export interface PlaygroundEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: PlaygroundEntry[];
}

const PLAYGROUNDS_LABEL = 'playground/';
const INDENT_BASE_PX = 8;
const INDENT_PER_LEVEL_PX = 12;

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 text-warning"
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
      width="16"
      height="16"
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
    <div className="select-none">
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center gap-1.5 py-1 px-2 text-left text-sm rounded hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary/30"
        style={{ paddingLeft: `${INDENT_BASE_PX + depth * INDENT_PER_LEVEL_PX}px` }}
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0" aria-hidden>
          {isDir && (
            <span
              className="text-muted-foreground"
              style={{
                transform: hasChildren && isOpen ? 'rotate(90deg)' : 'none',
                display: 'inline-block',
              }}
            >
              {hasChildren ? '▶' : '◆'}
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

export function FileExplorer() {
  const [tree, setTree] = useState<PlaygroundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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

  return (
    <div
      className="min-h-0 flex flex-1 flex-col border-r border-border bg-card/30"
      style={{ width: SIDEBAR_WIDTH_PX, minWidth: SIDEBAR_WIDTH_PX }}
    >
      <div className="px-3 py-2 border-b border-border font-medium text-sm text-foreground shrink-0">
        {PLAYGROUNDS_LABEL}
      </div>
      <div className="flex-1 overflow-auto py-1">
        {loading && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Loading…
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-sm text-destructive">{error}</div>
        )}
        {!loading && !error && tree.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No files in {PLAYGROUNDS_LABEL}
          </div>
        )}
        {!loading && !error && tree.length > 0 && (
          <div className="py-1">
            {tree.map((entry) => (
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
