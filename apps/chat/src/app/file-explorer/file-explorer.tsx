import {
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
  Search,
  Settings,
  X,
} from 'lucide-react';
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
const SIDEBAR_TITLE = 'Quantum Storage';
const SIDEBAR_SUBTITLE = `Phoenix v${__APP_VERSION__}`;

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
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.sass', '.html']);
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
                <FileText className="size-5 sm:size-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 sm:gap-3">
                  <h2 className="text-xl font-semibold text-foreground">File viewer</h2>
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

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="px-4 py-3 border-b border-border-subtle bg-muted/30 backdrop-blur-sm shrink-0 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {language === 'plain' ? 'Plain text' : language}
            </span>
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
  fullWidth: _fullWidth,
  collapsed,
  onSettingsClick,
}: {
  fullWidth?: boolean;
  collapsed?: boolean;
  onSettingsClick?: () => void;
} = {}) {
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

  const filteredTree = useMemo(() => filterTreeByQuery(tree, searchQuery), [tree, searchQuery]);
  const playgroundLabel = useMemo(
    () => (tree.length === 1 && tree[0].type === 'directory' ? `${tree[0].name}/` : PLAYGROUNDS_LABEL),
    [tree]
  );
  const openFileEntry =
    selectedFile !== null && selectedFile.type === 'file' ? selectedFile : null;

  const toolbarBtnClass =
    'rounded-md text-[9px] sm:text-[10px] font-medium text-foreground dark:text-white hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-colors';

  if (collapsed) {
    return (
      <>
        <div className="flex min-h-0 w-full flex-1 flex-col items-center bg-card/30 py-4 backdrop-blur-xl">
          <div className="flex flex-col items-center gap-3">
            <AnimatedPhoenixLogo className="size-8 text-violet-500" />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-md text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors"
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
        {openFileEntry && (
          <FileDetailsDialog entry={openFileEntry} onClose={() => setSelectedFile(null)} />
        )}
      </>
    );
  }

  return (
    <>
      <div
        className="min-h-0 flex w-full flex-1 flex-col bg-card/30 backdrop-blur-xl"
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
              />
            ))}
          </div>
        )}
      </div>
      </div>
      {openFileEntry && (
        <FileDetailsDialog entry={openFileEntry} onClose={() => setSelectedFile(null)} />
      )}
    </>
  );
}
