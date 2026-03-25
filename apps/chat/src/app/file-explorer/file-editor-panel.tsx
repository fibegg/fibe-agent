import {
  Check,
  Copy,
  Download,
  Edit3,
  FileText,
  Loader2,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_PATHS } from '@shared/api-paths';
import { apiRequest } from '../api-url';
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

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar({ language, lines, isDirty, isSaving }: { language: string; lines: number; isDirty: boolean; isSaving: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/50 bg-card/40 px-4 py-1.5 text-[10px] text-muted-foreground select-none">
      <div className="flex items-center gap-3">
        <span className="font-medium">{language}</span>
        <span>─</span>
        <span>{lines} lines</span>
      </div>
      <div className="flex items-center gap-2">
        {isSaving && (
          <span className="flex items-center gap-1 text-violet-400">
            <Loader2 className="size-3 animate-spin" />
            Saving…
          </span>
        )}
        {isDirty && !isSaving && (
          <span className="flex items-center gap-1 text-amber-400">
            <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
            Unsaved changes
          </span>
        )}
        {!isDirty && !isSaving && (
          <span className="text-green-500/70">Saved</span>
        )}
      </div>
    </div>
  );
}

// ─── FileEditorPanel ──────────────────────────────────────────────────────────

export function FileEditorPanel({
  entry,
  onClose,
  inline = false,
  apiBasePath,
  onDirtyChange,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
  inline?: boolean;
  apiBasePath?: string;
  onDirtyChange?: (path: string, isDirty: boolean) => void;
}) {
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [liveContent, setLiveContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorHandleRef = useRef<EditorHandle | null>(null);
  const isDark = useCallback(() => document.documentElement.classList.contains('dark'), []);

  const isDirty = liveContent !== null && originalContent !== null && liveContent !== originalContent;
  const lineCount = liveContent !== null ? liveContent.split('\n').length : null;
  const language = getLanguageLabel(entry.name);
  
  const isGitModified = entry.gitStatus === 'modified';
  const isGitAddedOrUntracked = entry.gitStatus === 'untracked' || entry.gitStatus === 'added';
  const isGitDeleted = entry.gitStatus === 'deleted';

  // Notify parent of dirty state changes
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  useEffect(() => {
    onDirtyChangeRef.current?.(entry.path, isDirty);
  }, [entry.path, isDirty]);

  // ── Fetch content ──────────────────────────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setFetchError(null);
    setOriginalContent(null);
    setLiveContent(null);
    setEditorReady(false);

    const path = `${apiBasePath ?? API_PATHS.PLAYGROUNDS_FILE}?path=${encodeURIComponent(entry.path)}`;

    apiRequest(path, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error('File not found');
          throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to load file');
        }
        const data = (await res.json()) as { content?: string };
        const text = typeof data.content === 'string' ? data.content : '';
        setOriginalContent(text);
        setLiveContent(text);
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') {
          setFetchError(e instanceof Error ? e.message : 'Failed to load file');
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [entry.path, apiBasePath]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Toast auto-dismiss ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Mount CodeMirror ───────────────────────────────────────────────────────
  useEffect(() => {
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
  }, [loading, fetchError, originalContent, entry.name]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (contentToSave?: string) => {
    const content = contentToSave ?? editorHandleRef.current?.getContent() ?? liveContent;
    if (content === null) return;

    setIsSaving(true);
    try {
      const savePath = apiBasePath
        ? apiBasePath.replace('/file', '/file')
        : API_PATHS.PLAYGROUNDS_FILE;

      const res = await apiRequest(savePath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path, content }),
      });

      if (!res.ok) throw new Error('Save failed');

      setOriginalContent(content);
      setLiveContent(content);
      setToast({ message: 'File saved', type: 'success' });
    } catch {
      setToast({ message: 'Failed to save file', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [entry.path, liveContent, apiBasePath]);

  // ── Copy ───────────────────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const content = editorHandleRef.current?.getContent() ?? liveContent;
    if (content !== null) void navigator.clipboard.writeText(content);
  }, [liveContent]);

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    const content = editorHandleRef.current?.getContent() ?? liveContent;
    if (content === null) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = entry.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [liveContent, entry.name]);

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

  return (
    <>
      <div
        className={panelClasses}
        style={inline ? undefined : { backgroundColor: 'var(--card)' }}
        onClick={inline ? undefined : (e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className={CARD_HEADER} style={{ minHeight: PANEL_HEADER_MIN_HEIGHT_PX }}>
          <div className={`flex items-center justify-between gap-2 min-w-0 ${HEADER_FIRST_ROW}`}>
            {/* Title */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={LOGO_ICON_BOX}>
                <Edit3 className="size-5 text-white" />
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
                        className={`text-[10px] font-bold tracking-wider ${
                          isGitModified ? 'text-amber-500 dark:text-amber-400' :
                          isGitAddedOrUntracked ? 'text-green-500 dark:text-green-400' :
                          isGitDeleted ? 'text-red-500 dark:text-red-400' :
                          'text-muted-foreground'
                        }`}
                        title={`Git: ${entry.gitStatus}`}
                      >
                        {isGitModified ? 'M' : isGitAddedOrUntracked ? 'U' : isGitDeleted ? 'D' : ''}
                      </span>
                    )}
                    {isDirty && (
                      <span
                        className="size-2 rounded-full bg-amber-400 shrink-0 animate-pulse"
                        title="Unsaved changes"
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
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!isDirty || isSaving}
                className={`${BUTTON_GHOST_ACCENT} ${isDirty ? 'text-violet-400 hover:text-violet-300' : ''}`}
                title="Save (Cmd+S)"
              >
                {isSaving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Save className="size-3" />
                )}
                Save
              </button>
              {isDirty && (
                <button
                  type="button"
                  onClick={handleDiscard}
                  className={BUTTON_GHOST_ACCENT}
                  title="Discard changes"
                >
                  <RotateCcw className="size-3" />
                  Discard
                </button>
              )}
              <button
                type="button"
                onClick={handleCopy}
                disabled={liveContent === null || loading}
                className={BUTTON_GHOST_ACCENT}
                title="Copy content"
              >
                <Copy className="size-3" />
                Copy
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={liveContent === null || loading}
                className={BUTTON_GHOST_ACCENT}
                title="Download file"
              >
                <Download className="size-3" />
                Download
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`${BUTTON_ICON_MUTED} size-8`}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Editor Area ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-card z-10">
              <Loader2 className="size-4 animate-spin mr-2" />
              Loading…
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
                  <p className="text-sm text-muted-foreground">Empty file</p>
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
              Empty file
            </div>
          )}
        </div>

        {/* ── Status Bar ──────────────────────────────────────────────────── */}
        {!loading && !fetchError && (
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
  onDirtyChange,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
  apiBasePath?: string;
  onDirtyChange?: (path: string, isDirty: boolean) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[92vw] h-[90vh] max-h-[calc(100vh-2rem)]">
        <FileEditorPanel entry={entry} onClose={onClose} apiBasePath={apiBasePath} onDirtyChange={onDirtyChange} />
      </div>
    </div>
  );
}
