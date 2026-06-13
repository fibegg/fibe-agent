import {
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Columns2,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  PanelRight,
  RotateCcw,
  Save,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { API_PATHS } from '@shared/api-paths';
import { apiRequest, getAuthTokenForRequest } from '../api-url';
import {
  BUTTON_GHOST_ACCENT,
  BUTTON_ICON_MUTED,
  CARD_HEADER,
  HEADER_FIRST_ROW,
  LOGO_ICON_BOX,
} from '../ui-classes';
import { PANEL_HEADER_MIN_HEIGHT_PX } from '../layout-constants';
import type { PlaygroundEntry } from './file-explorer-types';
import type { EditorHandle } from './file-editor-cm';
import { getLanguageLabel } from './file-editor-cm';
import { useT } from '../i18n';
import { copyTextToClipboard } from '../browser-compat';

const FILE_PREVIEW_STORAGE_KEY = 'fibe.fileEditor.filePreview';

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      className={`fixed bottom-4 right-4 z-[200] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg border animate-modal-enter ${
        type === 'success'
          ? 'bg-green-500/15 border-green-500/30 text-green-400'
          : 'bg-red-500/15 border-red-500/30 text-red-400'
      }`}
    >
      {type === 'success' ? <Check className="size-4 shrink-0" /> : <X className="size-4 shrink-0" />}
      {message}
    </div>
  );
}

function withQueryParams(path: string, params: Record<string, string>): string {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar({ language, lines, isDirty, isSaving }: { language: string; lines: number; isDirty: boolean; isSaving: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/50 bg-card/40 px-4 py-1.5 text-[10px] text-muted-foreground select-none">
      <div className="flex items-center gap-3">
        <span className="font-medium">{language}</span>
        <span>─</span>
        <span>{t('fileEditor.lines', { count: lines })}</span>
      </div>
      <div className="flex items-center gap-2">
        {isSaving && (
          <span className="flex items-center gap-1 text-primary">
            <Loader2 className="size-3 animate-spin" />
            {t('fileEditor.saving')}
          </span>
        )}
        {isDirty && !isSaving && (
          <span className="flex items-center gap-1 text-amber-400">
            <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
            {t('fileEditor.unsaved')}
          </span>
        )}
        {!isDirty && !isSaving && (
          <span className="text-green-500/70">{t('fileEditor.saved')}</span>
        )}
      </div>
    </div>
  );
}

function FilePreviewRail({ content, onJumpToLine }: { content: string; onJumpToLine: (lineNumber: number) => void }) {
  const t = useT();
  const lines = content.split('\n');
  const preview = lines.join('\n');

  const jumpFromPointer = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clientY = Number.isFinite(event.clientY) ? event.clientY : rect.top;
    const visibleOffset = rect.height > 0 ? clientY - rect.top : 0;
    const scrollableHeight = Math.max(event.currentTarget.scrollHeight, event.currentTarget.clientHeight, 1);
    const absoluteOffset = event.currentTarget.scrollTop + Math.max(0, visibleOffset);
    const ratio = absoluteOffset / scrollableHeight;
    const lineNumber = Math.max(1, Math.min(lines.length, Math.floor(ratio * lines.length) + 1));
    onJumpToLine(lineNumber);
  }, [lines.length, onJumpToLine]);

  const jumpFromKeyboard = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onJumpToLine(1);
  }, [onJumpToLine]);

  return (
    <aside
      aria-label={t('fileEditor.filePreview')}
      title={t('fileEditor.filePreviewJump')}
      tabIndex={0}
      onPointerDown={jumpFromPointer}
      onKeyDown={jumpFromKeyboard}
      className="group hidden w-24 shrink-0 cursor-pointer overflow-y-auto overflow-x-hidden border-l border-border/50 bg-background/80 px-1.5 py-2 outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-primary/60 lg:block"
    >
      <pre className="select-none whitespace-pre text-[3px] leading-[4px] text-muted-foreground/50 transition-colors group-hover:text-muted-foreground/70">
        {preview}
      </pre>
    </aside>
  );
}

// ─── FileEditorPanel ──────────────────────────────────────────────────────────

export function FileEditorPanel({
  entry,
  onClose,
  inline = false,
  apiBasePath,
  rawApiBasePath,
  onDirtyChange,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
  inline?: boolean;
  apiBasePath?: string;
  rawApiBasePath?: string;
  onDirtyChange?: (path: string, isDirty: boolean) => void;
}) {
  const t = useT();
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [liveContent, setLiveContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [previewMode, setPreviewMode] = useState<'code' | 'preview' | 'split'>('code');
  const [rawFileRevision, setRawFileRevision] = useState(0);
  const [imageFit, setImageFit] = useState<'fit' | 'actual'>('fit');
  const [imageZoom, setImageZoom] = useState(1);
  const [showFilePreview, setShowFilePreview] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(FILE_PREVIEW_STORAGE_KEY) === '1';
  });
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [fileSearchResult, setFileSearchResult] = useState<{ current: number; total: number } | null>(null);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorHandleRef = useRef<EditorHandle | null>(null);
  const fileSearchInputRef = useRef<HTMLInputElement>(null);
  const fileSearchQueryRef = useRef(fileSearchQuery);
  const isDark = useCallback(() => document.documentElement.classList.contains('dark'), []);

  const isDirty = liveContent !== null && originalContent !== null && liveContent !== originalContent;
  const lineCount = liveContent !== null ? liveContent.split('\n').length : null;
  const language = getLanguageLabel(entry.name);

  // ── Image files bypass the text editor entirely ────────────────────────────
  const IMAGE_FILE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico', '.tiff', '.tif']);
  function getFileExt(name: string): string {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i).toLowerCase() : '';
  }
  const ext = getFileExt(entry.name);
  const isImageFile = IMAGE_FILE_EXTS.has(ext);
  const isHtmlFile = ext === '.html' || ext === '.htm';
  const authToken = getAuthTokenForRequest();
  const rawFileUrl = withQueryParams(rawApiBasePath ?? API_PATHS.PLAYGROUNDS_FILE_RAW, {
    path: entry.path,
    ...(authToken ? { token: authToken } : {}),
    ...(rawFileRevision > 0 ? { v: String(rawFileRevision) } : {}),
  });
  
  const isGitModified = entry.gitStatus === 'modified';
  const isGitAddedOrUntracked = entry.gitStatus === 'untracked' || entry.gitStatus === 'added';
  const isGitDeleted = entry.gitStatus === 'deleted';
  const isGitRenamed = entry.gitStatus === 'renamed';

  fileSearchQueryRef.current = fileSearchQuery;

  // Notify parent of dirty state changes
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  useEffect(() => {
    onDirtyChangeRef.current?.(entry.path, isDirty);
  }, [entry.path, isDirty]);

  useEffect(() => {
    setPreviewMode(isHtmlFile ? 'preview' : 'code');
    setRawFileRevision(0);
    setImageFit('fit');
    setImageZoom(1);
    setFileSearchOpen(false);
    setFileSearchQuery('');
    setFileSearchResult(null);
  }, [entry.path, isHtmlFile]);

  useEffect(() => {
    window.localStorage.setItem(FILE_PREVIEW_STORAGE_KEY, showFilePreview ? '1' : '0');
  }, [showFilePreview]);

  // ── Fetch content (text files only) ──────────────────────────────────────
  useEffect(() => {
    if (isImageFile) { setLoading(false); return; }  // Skip text fetch for images
    const ac = new AbortController();
    setLoading(true);
    setFetchError(null);
    setOriginalContent(null);
    setLiveContent(null);
    setEditorReady(false);

    const path = withQueryParams(apiBasePath ?? API_PATHS.PLAYGROUNDS_FILE, { path: entry.path });

    apiRequest(path, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error(t('fileEditor.fileNotFound'));
          throw new Error(res.status === 401 ? t('fileEditor.unauthorized') : t('fileEditor.failedLoadFile'));
        }
        const data = (await res.json()) as { content?: string };
        const text = typeof data.content === 'string' ? data.content : '';
        setOriginalContent(text);
        setLiveContent(text);
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') {
          setFetchError(e instanceof Error ? e.message : t('fileEditor.failedLoadFile'));
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [entry.path, apiBasePath, isImageFile, t]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !isImageFile) {
        e.preventDefault();
        if (isHtmlFile && previewMode === 'preview') setPreviewMode('code');
        setFileSearchOpen(true);
        setTimeout(() => fileSearchInputRef.current?.focus(), 0);
        return;
      }
      if (e.key === 'Escape' && fileSearchOpen) {
        setFileSearchOpen(false);
        setFileSearchQuery('');
        setFileSearchResult(null);
        editorHandleRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fileSearchOpen, isHtmlFile, isImageFile, onClose, previewMode]);

  useEffect(() => {
    if (!editorReady || !fileSearchOpen) return;
    const trimmed = fileSearchQueryRef.current.trim();
    if (!trimmed) return;
    setFileSearchResult(editorHandleRef.current?.searchInFile(trimmed, 'next') ?? { current: 0, total: 0 });
  }, [editorReady, fileSearchOpen]);

  // ── Toast auto-dismiss ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Mount CodeMirror (text files only) ────────────────────────────────────
  useEffect(() => {
    if (isImageFile) return;  // Images don't use the text editor
    if (isHtmlFile && previewMode === 'preview') return;
    if (loading || fetchError || originalContent === null || !editorContainerRef.current) return;

    let destroyed = false;
    let handle: EditorHandle | null = null;

    import('./file-editor-cm').then(({ createEditor }) => {
      if (destroyed || !editorContainerRef.current) return;

      handle = createEditor({
        parent: editorContainerRef.current,
        content: originalContent,
        filename: entry.name,
        isDark: isDark(),
        readOnly: false,
        onChange(content) {
          setLiveContent(content);
        },
        onSave(content) {
          void handleSave(content);
        },
      });

      editorHandleRef.current = handle;
      setEditorReady(true);

      // Watch dark/light class toggle
      const observer = new MutationObserver(() => {
        handle?.setTheme(document.documentElement.classList.contains('dark'));
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

      // Focus editor
      setTimeout(() => handle?.focus(), 50);

      return () => observer.disconnect();
    }).catch(() => {
      // Editor failed to load — graceful degradation handled via !editorReady
    });

    return () => {
      destroyed = true;
      handle?.destroy();
      editorHandleRef.current = null;
      setEditorReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, fetchError, originalContent, entry.name, previewMode]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (contentToSave?: string) => {
    const content = contentToSave ?? editorHandleRef.current?.getContent() ?? liveContent;
    if (content === null) return;

    setIsSaving(true);
    try {
      const savePath = apiBasePath ?? API_PATHS.PLAYGROUNDS_FILE;

      const res = await apiRequest(savePath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path, content }),
      });

      if (!res.ok) throw new Error(t('fileEditor.saveFailed'));

      setOriginalContent(content);
      setLiveContent(content);
      if (isHtmlFile || isImageFile) setRawFileRevision((value) => value + 1);
      setToast({ message: t('fileEditor.fileSaved'), type: 'success' });
    } catch {
      setToast({ message: t('fileEditor.saveFailed'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [entry.path, liveContent, apiBasePath, t, isHtmlFile, isImageFile]);

  // ── Copy ───────────────────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const content = editorHandleRef.current?.getContent() ?? liveContent;
    if (content !== null) void copyTextToClipboard(content);
  }, [liveContent]);

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (isImageFile) {
      const a = document.createElement('a');
      a.href = rawFileUrl;
      a.download = entry.name;
      a.click();
      return;
    }
    const content = editorHandleRef.current?.getContent() ?? liveContent;
    if (content === null) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = entry.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [entry.name, isImageFile, liveContent, rawFileUrl]);

  const handleOpenRaw = useCallback(() => {
    window.open(rawFileUrl, '_blank', 'noopener,noreferrer');
  }, [rawFileUrl]);

  const handleJumpToPreviewLine = useCallback((lineNumber: number) => {
    editorHandleRef.current?.scrollToLine(lineNumber);
  }, []);

  const handleFileSearch = useCallback((query: string, direction: 'next' | 'previous') => {
    const trimmed = query.trim();
    if (!trimmed) {
      setFileSearchResult(null);
      return;
    }
    setFileSearchResult(editorHandleRef.current?.searchInFile(trimmed, direction) ?? { current: 0, total: 0 });
  }, []);

  const handleFileSearchChange = useCallback((query: string) => {
    setFileSearchQuery(query);
    handleFileSearch(query, 'next');
  }, [handleFileSearch]);

  const closeFileSearch = useCallback(() => {
    setFileSearchOpen(false);
    setFileSearchQuery('');
    setFileSearchResult(null);
    editorHandleRef.current?.focus();
  }, []);

  // ── Discard ────────────────────────────────────────────────────────────────
  const handleDiscard = useCallback(() => {
    if (originalContent === null) return;
    editorHandleRef.current?.setContent(originalContent);
    setLiveContent(originalContent);
  }, [originalContent]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const panelClasses = inline
    ? 'flex flex-col overflow-hidden bg-card flex-1 min-h-0 rounded-none border-0'
    : 'flex flex-col overflow-hidden bg-card w-full max-w-[95vw] sm:max-w-[92vw] sm:w-[92vw] h-[90vh] max-h-[calc(100vh-2rem)] border border-border rounded-xl shadow-card';
  const headerClasses = inline
    ? 'border-b border-border/50 bg-card/40 px-2 py-2 sm:px-4 backdrop-blur-xl shrink-0'
    : CARD_HEADER;
  const headerStyle = inline ? undefined : { minHeight: PANEL_HEADER_MIN_HEIGHT_PX };
  const headerRowClasses = inline
    ? 'min-h-10 flex-shrink-0 flex-wrap sm:flex-nowrap'
    : HEADER_FIRST_ROW;
  const logoClasses = inline
    ? 'size-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30 shrink-0'
    : LOGO_ICON_BOX;

  return (
    <>
      <div
        className={panelClasses}
        style={inline ? undefined : { backgroundColor: 'var(--card)' }}
        onClick={inline ? undefined : (e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className={headerClasses} style={headerStyle}>
          <div className={`flex items-center justify-between gap-2 min-w-0 ${headerRowClasses}`}>
            {/* Title */}
            <div className={`${inline ? 'hidden sm:flex' : 'flex'} items-center gap-3 min-w-0 flex-1`}>
              <div className={logoClasses}>
                <Edit3 className={inline ? 'size-4 text-white' : 'size-5 text-white'} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h2
                    className="font-semibold text-sm text-foreground truncate"
                    title={entry.path}
                  >
                    {entry.name}
                  </h2>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {entry.gitStatus && (
                      <span
                        className={`size-2 rounded-full shrink-0 ${
                          isGitModified ? 'bg-amber-400' :
                          isGitAddedOrUntracked ? 'bg-green-400' :
                          isGitDeleted ? 'bg-red-400' :
                          isGitRenamed ? 'bg-blue-400' :
                          'bg-muted-foreground'
                        }`}
                        title={t('fileEditor.gitStatus', { status: entry.gitStatus })}
                        aria-label={t('fileEditor.gitStatus', { status: entry.gitStatus })}
                      />
                    )}
                    {isDirty && (
                      <span
                        className="size-2 rounded-full bg-amber-400 shrink-0 animate-pulse"
                        title={t('fileEditor.unsaved')}
                      />
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={entry.path}>
                  {entry.path}
                </p>
              </div>
            </div>

            {/* Toolbar Buttons */}
            <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
              {isHtmlFile && (
                <div className="mr-1 flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-border/60 bg-background/60">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('preview')}
                    className={`grid size-8 place-items-center ${previewMode === 'preview' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    title={t('fileEditor.preview')}
                    aria-label={t('fileEditor.preview')}
                  >
                    <PanelRight className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('split')}
                    className={`grid size-8 place-items-center ${previewMode === 'split' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    title={t('fileEditor.split')}
                    aria-label={t('fileEditor.split')}
                  >
                    <Columns2 className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('code')}
                    className={`grid size-8 place-items-center ${previewMode === 'code' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    title={t('fileEditor.code')}
                    aria-label={t('fileEditor.code')}
                  >
                    <Code2 className="size-3.5" />
                  </button>
                </div>
              )}
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain sm:flex-none">
                {!isImageFile && (
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={!isDirty || isSaving}
                    className={`${BUTTON_GHOST_ACCENT} shrink-0 ${isDirty ? 'text-primary hover:text-primary' : ''}`}
                    title={t('fileEditor.saveTitle')}
                  >
                    {isSaving ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Save className="size-3" />
                    )}
                    <span className="hidden sm:inline">{t('fileEditor.save')}</span>
                  </button>
                )}
                {!isImageFile && isDirty && (
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className={`${BUTTON_GHOST_ACCENT} shrink-0`}
                    title={t('fileEditor.discardTitle')}
                  >
                    <RotateCcw className="size-3" />
                    <span className="hidden sm:inline">{t('fileEditor.discard')}</span>
                  </button>
                )}
                {!isImageFile && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextSearchOpen = !fileSearchOpen;
                      if (nextSearchOpen && isHtmlFile && previewMode === 'preview') setPreviewMode('code');
                      setFileSearchOpen(nextSearchOpen);
                      setTimeout(() => fileSearchInputRef.current?.focus(), 0);
                    }}
                    className={`${BUTTON_GHOST_ACCENT} shrink-0 ${fileSearchOpen ? 'text-primary hover:text-primary' : ''}`}
                    title={t('fileEditor.searchTitle')}
                    aria-label={t('fileEditor.search')}
                    aria-pressed={fileSearchOpen}
                  >
                    <Search className="size-3" />
                  </button>
                )}
                {!isImageFile && (
                  <button
                    type="button"
                    onClick={() => setShowFilePreview((value) => !value)}
                    className={`${BUTTON_GHOST_ACCENT} shrink-0 ${showFilePreview ? 'text-primary hover:text-primary' : ''}`}
                    title={t('fileEditor.filePreview')}
                    aria-label={t('fileEditor.filePreview')}
                    aria-pressed={showFilePreview}
                  >
                    <PanelRight className="size-3" />
                  </button>
                )}
                {!isImageFile && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={liveContent === null || loading}
                    className={`${BUTTON_GHOST_ACCENT} shrink-0`}
                    title={t('fileEditor.copyTitle')}
                  >
                    <Copy className="size-3" />
                    <span className="hidden sm:inline">{t('common.copy')}</span>
                  </button>
                )}
                {(isImageFile || isHtmlFile) && (
                  <button
                    type="button"
                    onClick={handleOpenRaw}
                    className={`${BUTTON_GHOST_ACCENT} shrink-0`}
                    title={t('fileEditor.openRaw')}
                  >
                    <ExternalLink className="size-3" />
                    <span className="hidden sm:inline">{t('fileEditor.open')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!isImageFile && (liveContent === null || loading)}
                  className={`${BUTTON_GHOST_ACCENT} shrink-0`}
                  title={t('fileEditor.downloadTitle')}
                >
                  <Download className="size-3" />
                  <span className="hidden sm:inline">{t('fileEditor.download')}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`${BUTTON_ICON_MUTED} size-8 shrink-0`}
                aria-label={t('common.close')}
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Image Preview (replaces editor for image files) ───────────────── */}
        {isImageFile && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background dark:bg-[#1a1a2e]">
            <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-card/35 px-4 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                <ImageIcon className="size-3.5 shrink-0" />
                <span className="truncate" title={entry.path}>{entry.path}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setImageFit('fit')}
                  className={`${BUTTON_ICON_MUTED} size-8 ${imageFit === 'fit' ? 'text-primary bg-primary/15' : ''}`}
                  title={t('fileEditor.fit')}
                  aria-label={t('fileEditor.fit')}
                >
                  <Maximize2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setImageFit('actual')}
                  className={`${BUTTON_ICON_MUTED} size-8 ${imageFit === 'actual' ? 'text-primary bg-primary/15' : ''}`}
                  title={t('fileEditor.actualSize')}
                  aria-label={t('fileEditor.actualSize')}
                >
                  <span className="text-[10px] font-semibold">1:1</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImageZoom((value) => Math.max(0.25, value - 0.25))}
                  className={`${BUTTON_ICON_MUTED} size-8`}
                  title={t('fileEditor.zoomOut')}
                  aria-label={t('fileEditor.zoomOut')}
                >
                  <ZoomOut className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImageFit('actual');
                    setImageZoom((value) => Math.min(4, value + 0.25));
                  }}
                  className={`${BUTTON_ICON_MUTED} size-8`}
                  title={t('fileEditor.zoomIn')}
                  aria-label={t('fileEditor.zoomIn')}
                >
                  <ZoomIn className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-6 flex items-center justify-center">
              <div
                className="rounded-xl border border-border/50 shadow-xl overflow-hidden bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
              >
                <img
                  src={rawFileUrl}
                  alt={entry.name}
                  className="object-contain block"
                  style={imageFit === 'fit'
                    ? { maxWidth: 'min(100%, 1200px)', maxHeight: 'calc(100vh - 12rem)' }
                    : { width: `${imageZoom * 100}%`, maxWidth: 'none' }}
                />
              </div>
            </div>
          </div>
        )}

        {!isImageFile && fileSearchOpen && (
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 bg-card/60 px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={fileSearchInputRef}
              type="text"
              value={fileSearchQuery}
              onChange={(event) => handleFileSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleFileSearch(fileSearchQuery, event.shiftKey ? 'previous' : 'next');
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  closeFileSearch();
                }
              }}
              placeholder={t('fileEditor.searchPlaceholder')}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="w-14 shrink-0 text-right text-[10px] text-muted-foreground">
              {fileSearchResult ? `${fileSearchResult.current}/${fileSearchResult.total}` : ''}
            </span>
            <button
              type="button"
              onClick={() => handleFileSearch(fileSearchQuery, 'previous')}
              className={`${BUTTON_ICON_MUTED} size-7`}
              title={t('fileEditor.previousMatch')}
              aria-label={t('fileEditor.previousMatch')}
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleFileSearch(fileSearchQuery, 'next')}
              className={`${BUTTON_ICON_MUTED} size-7`}
              title={t('fileEditor.nextMatch')}
              aria-label={t('fileEditor.nextMatch')}
            >
              <ChevronDown className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={closeFileSearch}
              className={`${BUTTON_ICON_MUTED} size-7`}
              title={t('common.close')}
              aria-label={t('common.close')}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* ── Editor Area ─────────────────────────────────────────────────── */}
        {!isImageFile && (
        <div className={`flex-1 overflow-hidden min-h-0 relative ${isHtmlFile && previewMode === 'split' ? 'grid grid-rows-2 md:grid-cols-2 md:grid-rows-none' : 'flex flex-col'}`}>
          {isHtmlFile && previewMode !== 'code' && (
            <div className={`${previewMode === 'split' ? 'order-2 border-t border-border/50 md:border-l md:border-t-0' : ''} min-h-0 flex-1 overflow-hidden bg-white`}>
              <iframe
                key={rawFileUrl}
                src={rawFileUrl}
                title={t('fileEditor.preview')}
                className="h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
              />
            </div>
          )}
          {previewMode !== 'preview' && (
          <div className={`${isHtmlFile && previewMode === 'split' ? 'order-1' : ''} relative flex min-h-0 flex-1 overflow-hidden`}>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-card z-10">
              <Loader2 className="size-4 animate-spin mr-2" />
              {t('common.loading')}
            </div>
          )}
          {fetchError && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="p-4 rounded-xl border border-border-subtle bg-muted/20 text-center max-w-sm">
                <FileText className="size-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{fetchError}</p>
              </div>
            </div>
          )}

          {/* CodeMirror mount point */}
          {!fetchError && (
            <div
              ref={editorContainerRef}
              className="flex-1 overflow-hidden min-h-0 bg-background dark:bg-[#1a1a2e] relative"
              style={{ display: loading ? 'none' : 'flex', flexDirection: 'column' }}
            >
              {/* Empty file placeholder shown inside editor if content is empty */}
              {!loading && liveContent === '' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
                  <p className="text-sm text-muted-foreground">{t('fileEditor.empty')}</p>
                </div>
              )}
            </div>
          )}

          {/* Fallback plain text if CM didn't mount */}
          {!loading && !fetchError && !editorReady && liveContent !== null && liveContent.length > 0 && (
            <div className="absolute inset-0 overflow-auto bg-background dark:bg-[#1e1e1e]">
              <pre className="p-4 text-sm font-mono text-foreground whitespace-pre-wrap">
                {liveContent}
              </pre>
            </div>
          )}
          {!loading && !fetchError && !editorReady && liveContent === '' && (
            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
              {t('fileEditor.empty')}
            </div>
          )}
          </div>
          {showFilePreview && liveContent !== null && !loading && !fetchError && (
            <FilePreviewRail content={liveContent} onJumpToLine={handleJumpToPreviewLine} />
          )}
          </div>
          )}
        </div>
        )}

        {/* ── Status Bar (text files only) ─────────────────────────────────── */}
        {!isImageFile && !loading && !fetchError && (
          <StatusBar
            language={language}
            lines={lineCount ?? 0}
            isDirty={isDirty}
            isSaving={isSaving}
          />
        )}
      </div>

      {/* ── Toast Notification ──────────────────────────────────────────── */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </>
  );
}

// ─── Modal Wrapper ─────────────────────────────────────────────────────────────

export function FileEditorDialog({
  entry,
  onClose,
  apiBasePath,
  rawApiBasePath,
  onDirtyChange,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
  apiBasePath?: string;
  rawApiBasePath?: string;
  onDirtyChange?: (path: string, isDirty: boolean) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[92vw] h-[90vh] max-h-[calc(100vh-2rem)]">
        <FileEditorPanel
          entry={entry}
          onClose={onClose}
          apiBasePath={apiBasePath}
          rawApiBasePath={rawApiBasePath}
          onDirtyChange={onDirtyChange}
        />
      </div>
    </div>
  );
}
