import { Copy, Download, FileText, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_PATHS } from '@shared/api-paths';
import { apiRequest } from '../api-url';
import {
  BUTTON_GHOST_ACCENT,
  BUTTON_ICON_MUTED,
  CARD_HEADER,
  CLEAR_BUTTON_POSITION,
  HEADER_FIRST_ROW,
  INPUT_SEARCH,
  LOGO_ICON_BOX,
  MODAL_OVERLAY,
  SEARCH_ICON_POSITION,
  SEARCH_ROW_WRAPPER,
} from '../ui-classes';
import { PANEL_HEADER_MIN_HEIGHT_PX } from '../layout-constants';
import { LANGUAGE_LABEL, getPrismLanguage } from './file-explorer-prism';
import type { PlaygroundEntry } from './file-explorer-types';

type PrismLoader = { highlightCodeElement: (el: HTMLElement) => void };

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
  const [prismLoader, setPrismLoader] = useState<PrismLoader | null>(null);
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
    const path = `${API_PATHS.PLAYGROUNDS_FILE}?path=${encodeURIComponent(entry.path)}`;
    void (async () => {
      try {
        const res = await apiRequest(path);
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
        if (!cancelled) {
          setContent(text);
          setFetchError(null);
        }
      } catch (e) {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : 'Failed to load file');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.path]);

  const language = getPrismLanguage(entry.name);
  const languageClass = language === 'plain' ? '' : `language-${language}`;
  const languageLabel = LANGUAGE_LABEL[language] ?? (language === 'plain' ? 'Plain text' : language);
  const lineCount = content !== null ? content.split('\n').length : null;

  useEffect(() => {
    if (!content || loading || language === 'plain') return;
    import('./prism-loader').then((m) => setPrismLoader(m));
  }, [content, loading, language]);

  useEffect(() => {
    if (!content || loading || fetchError || !codeRef.current || language === 'plain' || !prismLoader) return;
    try {
      prismLoader.highlightCodeElement(codeRef.current);
    } catch {
      // Leave existing text content if highlighting fails
    }
  }, [content, loading, fetchError, language, prismLoader]);

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
      <div className={CARD_HEADER} style={{ minHeight: PANEL_HEADER_MIN_HEIGHT_PX }}>
        <div className={`flex items-center justify-between gap-2 min-w-0 ${HEADER_FIRST_ROW}`}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={LOGO_ICON_BOX}>
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
              className={BUTTON_GHOST_ACCENT}
            >
              <Copy className="size-3" />
              Copy
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={content === null || loading}
              className={BUTTON_GHOST_ACCENT}
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
        <div className={SEARCH_ROW_WRAPPER}>
          <Search className={SEARCH_ICON_POSITION} />
          <input
            type="text"
            value={searchInFile}
            onChange={(e) => setSearchInFile(e.target.value)}
            placeholder="Search in file..."
            className={INPUT_SEARCH}
          />
          {searchInFile && (
            <button
              type="button"
              onClick={() => setSearchInFile('')}
              className={CLEAR_BUTTON_POSITION}
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

export function FileDetailsDialog({
  entry,
  onClose,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
}) {
  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        <FileViewerPanel entry={entry} onClose={onClose} />
      </div>
    </div>
  );
}
