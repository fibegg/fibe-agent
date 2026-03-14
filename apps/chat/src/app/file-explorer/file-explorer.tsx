import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { FileIcon } from '../file-icon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/plugins/line-numbers/prism-line-numbers';
import 'prismjs/plugins/line-numbers/prism-line-numbers.css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-json5';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-go-module';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-zig';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-dart';
import 'prismjs/components/prism-haskell';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-nim';
import 'prismjs/components/prism-elixir';
import 'prismjs/components/prism-erlang';
import 'prismjs/components/prism-clojure';
import 'prismjs/components/prism-groovy';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-fsharp';
import 'prismjs/components/prism-ocaml';
import 'prismjs/components/prism-solidity';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-makefile';
import 'prismjs/components/prism-cmake';
import 'prismjs/components/prism-gradle';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-pug';
import 'prismjs/components/prism-less';
import 'prismjs/components/prism-stylus';
import 'prismjs/components/prism-coffeescript';
import 'prismjs/components/prism-julia';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-basic';
import 'prismjs/components/prism-vbnet';
import 'prismjs/components/prism-protobuf';
import 'prismjs/components/prism-nginx';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-csv';
import 'prismjs/components/prism-rest';
import 'prismjs/components/prism-latex';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-gdscript';
import 'prismjs/components/prism-glsl';
import 'prismjs/components/prism-verilog';
import 'prismjs/components/prism-vhdl';
import 'prismjs/components/prism-wasm';
import 'prismjs/components/prism-d';
import 'prismjs/components/prism-crystal';
import 'prismjs/components/prism-fortran';
import 'prismjs/components/prism-nix';
import 'prismjs/components/prism-hcl';
import 'prismjs/components/prism-properties';
import 'prismjs/components/prism-editorconfig';
import 'prismjs/components/prism-dot';
import 'prismjs/components/prism-mermaid';
import { getApiUrl, getAuthTokenForRequest } from '../api-url';
import { AnimatedPhoenixLogo } from '../animated-phoenix-logo';
import { SidebarToggle } from '../sidebar-toggle';
import { ThemeToggle } from '../theme-toggle';

const PRISM_LANGUAGES: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  html: 'markup',
  htm: 'markup',
  json: 'json',
  json5: 'json5',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  pyw: 'python',
  rb: 'ruby',
  go: 'go',
  mod: 'go-module',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  php: 'php',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  xml: 'markup',
  vue: 'markup',
  svg: 'markup',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  cs: 'csharp',
  h: 'c',
  hpp: 'cpp',
  zig: 'zig',
  lua: 'lua',
  dart: 'dart',
  hs: 'haskell',
  lhs: 'haskell',
  scala: 'scala',
  sc: 'scala',
  nim: 'nim',
  nimble: 'nim',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hrl: 'erlang',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  edn: 'clojure',
  groovy: 'groovy',
  gy: 'groovy',
  gvy: 'groovy',
  pl: 'perl',
  pm: 'perl',
  ps1: 'powershell',
  psm1: 'powershell',
  pssc: 'powershell',
  fs: 'fsharp',
  fsi: 'fsharp',
  fsx: 'fsharp',
  ml: 'ocaml',
  mli: 'ocaml',
  sol: 'solidity',
  toml: 'toml',
  makefile: 'makefile',
  mk: 'makefile',
  cmake: 'cmake',
  gradle: 'gradle',
  ini: 'ini',
  cfg: 'ini',
  graphql: 'graphql',
  gql: 'graphql',
  pug: 'pug',
  jade: 'pug',
  less: 'less',
  styl: 'stylus',
  coffee: 'coffeescript',
  jl: 'julia',
  r: 'r',
  R: 'r',
  vb: 'vbnet',
  proto: 'protobuf',
  nginx: 'nginx',
  diff: 'diff',
  patch: 'diff',
  csv: 'csv',
  rst: 'rest',
  tex: 'latex',
  latex: 'latex',
  m: 'objectivec',
  mm: 'objectivec',
  gd: 'gdscript',
  glsl: 'glsl',
  vert: 'glsl',
  frag: 'glsl',
  v: 'verilog',
  sv: 'verilog',
  vhd: 'vhdl',
  vhdl: 'vhdl',
  wat: 'wasm',
  ll: 'llvm',
  d: 'd',
  cr: 'crystal',
  f: 'fortran',
  f90: 'fortran',
  f95: 'fortran',
  nix: 'nix',
  hcl: 'hcl',
  tf: 'hcl',
  tfvars: 'hcl',
  properties: 'properties',
  props: 'properties',
  editorconfig: 'editorconfig',
  dot: 'dot',
  mermaid: 'mermaid',
  mmd: 'mermaid',
};

function getPrismLanguage(filename: string): string {
  const baseName = filename.includes('/') ? filename.slice(filename.lastIndexOf('/') + 1) : filename;
  if (baseName === 'Dockerfile' || baseName.startsWith('Dockerfile.')) {
    return 'docker';
  }
  if (baseName === 'Makefile' || baseName === 'makefile') {
    return 'makefile';
  }
  const ext = baseName.includes('.') ? baseName.slice(baseName.lastIndexOf('.') + 1).toLowerCase() : '';
  return PRISM_LANGUAGES[ext] ?? 'plain';
}

export interface PlaygroundEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: PlaygroundEntry[];
}

const PLAYGROUNDS_LABEL = 'playground/';
const SIDEBAR_TITLE = 'Standalone';
const REFETCH_WHEN_EMPTY_MS = 8000;
const SIDEBAR_SUBTITLE = `Phoenix v${__APP_VERSION__}`;

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

function findEntryByPath(entries: PlaygroundEntry[], path: string): PlaygroundEntry | null {
  for (const e of entries) {
    if (e.path === path) return e;
    if (e.children?.length) {
      const found = findEntryByPath(e.children, path);
      if (found) return found;
    }
  }
  return null;
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

const LANGUAGE_LABEL: Record<string, string> = {
  plain: 'Plain text',
  markdown: 'Markdown',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  python: 'Python',
  bash: 'Bash',
};

export function FileViewerPanel({
  entry,
  onClose,
  inline = false,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
  inline?: boolean;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchInFile, setSearchInFile] = useState('');
  const codeRef = useRef<HTMLElement>(null);

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
    const url = `${base || ''}/api/playgrounds/file?path=${encodeURIComponent(entry.path)}`;
    const token = getAuthTokenForRequest();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(url, { headers })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setFetchError('File not found');
            setContent(null);
            return;
          }
          throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to load file');
        }
        const data = (await res.json()) as { content?: string };
        const text = typeof data.content === 'string' ? data.content : '';
        setContent(text);
        setFetchError(null);
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

  const language = getPrismLanguage(entry.name);
  const languageClass = language === 'plain' ? '' : `language-${language}`;
  const languageLabel = LANGUAGE_LABEL[language] ?? (language === 'plain' ? 'Plain text' : language);
  const lineCount = content !== null ? content.split('\n').length : null;

  useEffect(() => {
    if (!content || loading || fetchError || !codeRef.current || language === 'plain') return;
    try {
      Prism.highlightElement(codeRef.current);
    } catch {
      // Leave existing text content if highlighting fails
    }
  }, [content, loading, fetchError, language]);

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

  return (
    <div
      className={`flex flex-col overflow-hidden bg-card ${inline ? 'flex-1 min-h-0 rounded-none border-0' : 'w-full max-w-[95vw] sm:max-w-[90vw] sm:w-[90vw] h-[85vh] sm:h-[90vh] max-h-[calc(100vh-2rem)] border border-border rounded-xl shadow-card'}`}
      style={inline ? undefined : { backgroundColor: 'var(--card)' }}
      onClick={inline ? undefined : (e) => e.stopPropagation()}
    >
      <div className="px-4 pt-4 pb-[11px] border-b border-border/50 bg-card/40 backdrop-blur-xl shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="size-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0">
              <FileText className="size-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-sm text-foreground truncate" title={entry.name}>
                {entry.name}
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {languageLabel}
                {lineCount !== null ? ` - ${lineCount} lines` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
            <button
              type="button"
              onClick={onClose}
              className="size-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="relative h-8">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchInFile}
            onChange={(e) => setSearchInFile(e.target.value)}
            placeholder="Search in file..."
            className="h-8 w-full pl-8 pr-8 text-xs rounded-md bg-input-background dark:bg-input/30 border border-border focus:border-violet-500 dark:focus:border-primary text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:focus:ring-primary/30"
          />
          {searchInFile && (
            <button
              type="button"
              onClick={() => setSearchInFile('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-auto min-h-0 bg-[#2d2d2d] dark:bg-[#1e1e1e]">
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
          {!loading && !fetchError && content !== null && content.length > 0 && (
            <pre className="line-numbers !m-0 !rounded-none !bg-transparent p-4 text-sm font-mono min-h-full" key={entry.path}>
              <code ref={codeRef} className={languageClass}>
                {content}
              </code>
            </pre>
          )}
          {!loading && !fetchError && content !== null && content.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">Empty file</div>
          )}
        </div>
      </div>
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <FileViewerPanel entry={entry} onClose={onClose} />
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
  selectedPath,
}: {
  entry: PlaygroundEntry;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onFileClick?: (entry: PlaygroundEntry) => void;
  selectedPath?: string | null;
}) {
  const isDir = entry.type === 'directory';
  const isOpen = expanded.has(entry.path);
  const hasChildren = isDir && (entry.children?.length ?? 0) > 0;
  const isSelected = selectedPath === entry.path;

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
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs rounded-md cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-violet-500/30 ${
          isSelected ? 'bg-violet-500/10 text-violet-400' : 'text-foreground hover:bg-muted/50 focus:bg-violet-500/5'
        }`}
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
            <FolderOpen className="size-3.5 shrink-0 text-violet-400" aria-hidden />
          ) : (
            <Folder className="size-3.5 shrink-0 text-violet-400" aria-hidden />
          )
        ) : (
          <FileIcon pathOrName={entry.name} />
        )}
        <span className={`min-w-0 flex-1 truncate ${isSelected ? 'text-violet-400' : 'text-foreground'}`}>{entry.name}</span>
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
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({
  fullWidth: _fullWidth,
  collapsed,
  onSettingsClick,
  onClose,
  onToggleCollapse,
  onFileSelect,
  selectedPath: selectedPathProp,
  refreshTrigger,
}: {
  fullWidth?: boolean;
  collapsed?: boolean;
  onSettingsClick?: () => void;
  onClose?: () => void;
  onToggleCollapse?: () => void;
  onFileSelect?: (entry: PlaygroundEntry) => void;
  selectedPath?: string | null;
  refreshTrigger?: number;
} = {}) {
  const [tree, setTree] = useState<PlaygroundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileLocal, setSelectedFileLocal] = useState<PlaygroundEntry | null>(null);
  const selectedFile = selectedPathProp !== undefined
    ? (tree.length > 0 ? findEntryByPath(tree, selectedPathProp ?? '') : null)
    : selectedFileLocal;

  const refetch = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const base = getApiUrl();
    const url = base ? `${base}/api/playgrounds` : '/api/playgrounds';
    const token = getAuthTokenForRequest();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(url, { headers, signal });
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
        setExpanded((prev) => new Set(getDirPathsAtDepth(list, 0)));
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setTree([]);
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void refetch(ac.signal);
    return () => ac.abort();
  }, [refetch]);

  useEffect(() => {
    if (refreshTrigger === undefined) return;
    void refetch();
  }, [refreshTrigger, refetch]);

  useEffect(() => {
    if (tree.length > 0 || loading) return;
    const id = setInterval(() => void refetch(), REFETCH_WHEN_EMPTY_MS);
    return () => clearInterval(id);
  }, [tree.length, loading, refetch]);

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetchRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

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

  const filteredTree = useMemo(() => filterTreeByQuery(tree, searchQuery), [tree, searchQuery]);
  const playgroundLabel = useMemo(
    () => (tree.length === 1 && tree[0].type === 'directory' ? `${tree[0].name}/` : PLAYGROUNDS_LABEL),
    [tree]
  );
  const openFileEntry =
    !onFileSelect && selectedFile !== null && selectedFile.type === 'file' ? selectedFile : null;

  const collapsedContent = (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center border-r border-border/50 bg-card/30 py-4 backdrop-blur-xl">
      <div className="flex flex-1 flex-col items-center pt-4 gap-3">
        <AnimatedPhoenixLogo className="size-8 text-violet-500" />
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-md text-violet-400 hover:bg-violet-500/10 transition-colors"
            title="Settings"
            aria-label="Settings"
            onClick={onSettingsClick}
          >
            <Settings className="size-4" />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );

  const expandedContent = (
    <div className="min-h-0 flex w-full flex-1 flex-col bg-card/30 backdrop-blur-xl border-r border-border/50">
      <div className="p-4 border-b border-border/50 bg-gradient-to-br from-violet-500/10 via-transparent to-purple-500/5 backdrop-blur-sm shrink-0">
        <div className="flex items-center justify-between mb-2">
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
              onClick={onSettingsClick}
            >
              <Settings className="size-3.5 sm:size-4" />
            </button>
            <ThemeToggle />
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="size-7 sm:size-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-violet-500/10 transition-colors"
                aria-label="Close"
              >
                <X className="size-3.5 sm:size-4" />
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 sm:size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className={`w-full h-8 pl-7 sm:pl-8 text-[11px] sm:text-xs rounded-md bg-input-background dark:bg-input/30 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-500 dark:focus:border-primary focus:ring-2 focus:ring-violet-500/20 dark:focus:ring-primary/30 ${searchQuery ? 'pr-7 sm:pr-8' : 'pr-2'}`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
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
            No files in {playgroundLabel}
          </div>
        )}
        {!loading && !error && tree.length > 0 && filteredTree.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No matches for &quot;{searchQuery}&quot;
          </div>
        )}
        {!loading && !error && filteredTree.length > 0 && (
          <div className="p-2">
            <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">{playgroundLabel}</div>
            {filteredTree.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                expanded={expanded}
                onToggle={handleToggle}
                onFileClick={handleFileClick}
                selectedPath={selectedPathProp ?? openFileEntry?.path ?? null}
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
      {onToggleCollapse && collapsed !== undefined ? (
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
