import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsRight,
  Code,
  Copy,
  Download,
  File,
  FileText,
  Folder,
  FolderOpen,
  Image,
  Info,
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

function getMaxExpandedDepth(entries: PlaygroundEntry[], expanded: Set<string>): number {
  let d = 0;
  let max = -1;
  while (true) {
    const paths = getDirPathsAtDepth(entries, d);
    if (paths.length === 0) break;
    if (paths.some((p) => expanded.has(p))) max = d;
    d++;
  }
  return max;
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

function FileTypeIcon({ name }: { name: string }) {
  const { Icon, color } = getFileIconAndColor(name);
  return <Icon className={`size-3.5 shrink-0 ${color}`} aria-hidden />;
}

interface CodeReviewIssue {
  type: 'error' | 'warning' | 'info' | 'success';
  line?: number;
  message: string;
  suggestion?: string;
}

function mockCodeReview(fileName: string): CodeReviewIssue[] {
  if (fileName.endsWith('.md')) {
    return [
      { type: 'success', message: 'Markdown syntax is valid' },
      { type: 'info', message: 'Consider adding more section headings for better structure' },
      { type: 'info', line: 5, message: 'This section could benefit from code examples' },
    ];
  }
  if (fileName.endsWith('.json')) {
    return [
      { type: 'success', message: 'JSON structure is valid' },
      { type: 'warning', line: 12, message: 'Consider using semantic versioning for version field' },
    ];
  }
  return [
    { type: 'success', message: 'Code structure looks good' },
    {
      type: 'warning',
      line: 45,
      message: 'Consider extracting this logic into a separate function',
      suggestion: 'function extractedLogic() { ... }',
    },
    { type: 'info', line: 78, message: 'This variable could be renamed for better clarity' },
    {
      type: 'error',
      line: 120,
      message: 'Potential null reference error',
      suggestion: 'Add null check before accessing property',
    },
  ];
}

function getIssueIcon(type: string) {
  switch (type) {
    case 'error':
      return <AlertTriangle className="size-4 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="size-4 text-amber-500" />;
    case 'success':
      return <CheckCircle2 className="size-4 text-green-500" />;
    default:
      return <Info className="size-4 text-blue-500" />;
  }
}

function getIssueColor(type: string): string {
  switch (type) {
    case 'error':
      return 'border-red-500/30 bg-red-500/5';
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/5';
    case 'success':
      return 'border-green-500/30 bg-green-500/5';
    default:
      return 'border-blue-500/30 bg-blue-500/5';
  }
}

function contentToUnifiedDiff(content: string): string {
  const lines = content.split(/\r?\n/);
  const n = lines.length;
  if (n === 0) return '@@ -0,0 +0,0 @@';
  return `@@ -0,0 +1,${n} @@\n${lines.map((l) => `+ ${l}`).join('\n')}`;
}

function renderDiffLine(line: string, index: number) {
  const isAddition = line.startsWith('+') && !line.startsWith('+++');
  const isDeletion = line.startsWith('-') && !line.startsWith('---');
  const isHeader = line.startsWith('@@');
  let className = 'flex px-4 py-0.5 ';
  if (isHeader) {
    className += 'bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold';
  } else if (isAddition) {
    className += 'bg-green-500/10 text-green-700 dark:text-green-400';
  } else if (isDeletion) {
    className += 'bg-red-500/10 text-red-700 dark:text-red-400';
  } else {
    className += 'text-muted-foreground';
  }
  return (
    <div key={index} className={className}>
      <span className="select-none shrink-0 w-8 text-right pr-3 text-muted-foreground/70">
        {index + 1}
      </span>
      <span className="min-w-0">{line}</span>
    </div>
  );
}

function FileDetailsDialog({
  entry,
  onClose,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setContent(null);
    const base = getApiUrl();
    const url = base
      ? `${base}/api/playgrounds/file?path=${encodeURIComponent(entry.path)}`
      : `/api/playgrounds/file?path=${encodeURIComponent(entry.path)}`;
    const token = getAuthTokenForRequest();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(url, { headers })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setContent('');
            return;
          }
          throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to load file');
        }
        const data = (await res.json()) as { content?: string };
        setContent(typeof data.content === 'string' ? data.content : '');
      })
      .catch((e) => {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : 'Failed to load file');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.path]);

  const handleCopy = useCallback(() => {
    if (content === null) return;
    void navigator.clipboard.writeText(content);
  }, [content]);

  const handleDownload = useCallback(() => {
    if (content === null) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = entry.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [content, entry.name]);

  const issues = mockCodeReview(entry.name);
  const errorCount = issues.filter((i) => i.type === 'error').length;
  const warningCount = issues.filter((i) => i.type === 'warning').length;
  const infoCount = issues.filter((i) => i.type === 'info').length;
  const successCount = issues.filter((i) => i.type === 'success').length;
  const diffContent =
    content !== null && !loading && !fetchError ? contentToUnifiedDiff(content) : '';
  const diffLines = diffContent ? diffContent.split('\n') : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-[95vw] sm:max-w-[90vw] sm:w-[90vw] h-[85vh] sm:h-[90vh] max-h-[calc(100vh-2rem)] border border-border rounded-xl shadow-card overflow-hidden"
        style={{ backgroundColor: 'var(--card)' }}
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
                  <h2 className="text-xl font-semibold text-foreground">AI Code Review</h2>
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
                <div className="flex gap-3 mt-3 text-foreground">
                  {errorCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="size-2 rounded-full bg-red-500" />
                      <span>{errorCount} Error{errorCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {warningCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="size-2 rounded-full bg-amber-500" />
                      <span>{warningCount} Warning{warningCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {infoCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="size-2 rounded-full bg-blue-500" />
                      <span>{infoCount} Info</span>
                    </div>
                  )}
                  {successCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="size-2 rounded-full bg-green-500" />
                      <span>{successCount} Success</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="flex-1 flex flex-col border-r border-border-subtle min-h-0">
            <div className="px-4 py-3 border-b border-border-subtle bg-muted/30 backdrop-blur-sm shrink-0 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Git Diff Changes</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={content === null || loading}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 h-7 text-xs text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 disabled:opacity-50"
                >
                  <Copy className="size-3" />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={content === null || loading}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 h-7 text-xs text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 disabled:opacity-50"
                >
                  <Download className="size-3" />
                  Download
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              {loading && (
                <div className="p-4 flex items-center justify-center text-sm text-muted-foreground">
                  Loading…
                </div>
              )}
              {fetchError && (
                <div className="p-4 rounded-xl border border-border-subtle bg-muted/20 m-4 text-center">
                  <p className="text-sm text-muted-foreground">{fetchError}</p>
                </div>
              )}
              {!loading && !fetchError && diffLines.length === 0 && content !== null && (
                <div className="p-4 text-sm text-muted-foreground">Empty file</div>
              )}
              {!loading && !fetchError && diffLines.length > 0 && (
                <pre className="text-xs font-mono bg-muted/30 dark:bg-card/40 backdrop-blur-sm border-b border-border-subtle p-0 m-0 min-h-full">
                  <code className="block">
                    {diffLines.map((line, index) => renderDiffLine(line, index))}
                  </code>
                </pre>
              )}
            </div>
          </div>

          <div className="w-96 flex flex-col min-h-0 min-w-0 bg-muted/20 dark:bg-card/20 backdrop-blur-sm shrink-0">
            <div className="px-4 py-3 border-b border-border-subtle bg-gradient-to-r from-violet-500/10 to-purple-500/10 backdrop-blur-sm shrink-0">
              <h3 className="text-sm font-medium text-foreground">AI Analysis</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Powered by Phoenix AI</p>
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              <div className="p-4 space-y-3">
                {issues.map((issue, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border backdrop-blur-sm text-foreground ${getIssueColor(issue.type)}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">{getIssueIcon(issue.type)}</div>
                      <div className="flex-1 min-w-0">
                        {issue.line != null && (
                          <div className="text-xs font-mono text-muted-foreground mb-1">
                            Line {issue.line}
                          </div>
                        )}
                        <p className="text-sm leading-relaxed text-foreground">{issue.message}</p>
                        {issue.suggestion && (
                          <div className="mt-2 p-2 bg-muted/80 rounded-lg border border-border-subtle">
                            <p className="text-xs text-muted-foreground mb-1">Suggestion:</p>
                            <code className="text-xs font-mono text-foreground">{issue.suggestion}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20 backdrop-blur-sm text-foreground">
                  <div className="flex items-start gap-3">
                    <Sparkles className="size-5 text-violet-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium mb-2 text-foreground">Overall Assessment</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Your code quality is good with minor improvements needed. The structure is
                        solid, but consider the suggestions above to enhance maintainability and
                        prevent potential issues.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border-subtle space-y-2 backdrop-blur-sm">
              <button
                type="button"
                className="w-full h-9 rounded-md bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-medium shadow-lg shadow-violet-500/20"
              >
                Apply Suggestions
              </button>
              <button
                type="button"
                className="w-full h-9 rounded-md border border-border hover:bg-muted/50 dark:border-violet-500/30 dark:hover:bg-violet-500/10 text-foreground text-sm font-medium"
              >
                Export Report
              </button>
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
        <span className="w-3 flex shrink-0 items-center justify-center text-foreground/70 dark:text-muted-foreground" aria-hidden>
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
            <FolderOpen className="size-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
          ) : (
            <Folder className="size-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
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

export function FileExplorer({
  fullWidth,
  onSettingsClick,
}: { fullWidth?: boolean; onSettingsClick?: () => void } = {}) {
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
        const list = Array.isArray(data) ? data : [];
        setTree(list);
        setError(null);
        if (list.length > 0) {
          setExpanded(new Set(getDirPathsAtDepth(list, 0)));
        }
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
      const maxD = getMaxExpandedDepth(tree, prev);
      getDirPathsAtDepth(tree, maxD + 1).forEach((p) => next.add(p));
      return next;
    });
  }, [tree]);

  const collapseOneLevel = useCallback(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const maxD = getMaxExpandedDepth(tree, prev);
      if (maxD >= 0) getDirPathsAtDepth(tree, maxD).forEach((p) => next.delete(p));
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
    'rounded-md text-[9px] sm:text-[10px] font-medium text-foreground dark:text-white hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-colors';

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
              className="size-7 sm:size-8 flex items-center justify-center rounded-md text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors"
              title="Settings"
              aria-label="Settings"
              onClick={onSettingsClick}
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
