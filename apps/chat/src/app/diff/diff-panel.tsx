import { useCallback, useEffect, useRef, useState } from 'react';
import { GitCompareArrows, RefreshCw, FileText, FilePlus, FileMinus, FileQuestion } from 'lucide-react';
import { API_PATHS } from '@shared/api-paths';
import { apiRequest } from '../api-url';
import { useT, type TranslationKey } from '../i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChangedFile {
  path: string;
  index: string;
  worktree: string;
}

interface DiffResult {
  files: ChangedFile[];
  diff: string;
  hasDiff: boolean;
  isGitRepo: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a human-readable label + colour token for a status letter pair. */
function fileStatusInfo(index: string, worktree: string) {
  const combined = `${index}${worktree}`.replace(/ /g, '');
  if (combined.includes('?')) return { labelKey: 'diff.status.untracked' as const, color: 'text-amber-400', Icon: FileQuestion };
  if (combined.includes('A')) return { labelKey: 'diff.status.added' as const,     color: 'text-emerald-400', Icon: FilePlus };
  if (combined.includes('D')) return { labelKey: 'diff.status.deleted' as const,   color: 'text-red-400',     Icon: FileMinus };
  if (combined.includes('R')) return { labelKey: 'diff.status.renamed' as const,   color: 'text-blue-400',    Icon: FileText };
  return                                { labelKey: 'diff.status.modified' as const, color: 'text-violet-400',  Icon: FileText };
}

/**
 * Render one line of unified diff as a React element with colour coding.
 * We split by lines in the parent to keep this cheap.
 */
function DiffLine({ line, idx }: { line: string; idx: number }) {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return (
      <div key={idx} className="text-muted-foreground/80 font-medium">
        {line}
      </div>
    );
  }
  if (line.startsWith('@@')) {
    return (
      <div key={idx} className="text-cyan-400/70 mt-2 mb-0.5 text-[10px]">
        {line}
      </div>
    );
  }
  if (line.startsWith('diff ') || line.startsWith('index ')) {
    return (
      <div key={idx} className="text-muted-foreground/50 text-[10px] mt-3">
        {line}
      </div>
    );
  }
  if (line.startsWith('+')) {
    return (
      <div key={idx} className="bg-emerald-500/10 text-emerald-300">
        {line}
      </div>
    );
  }
  if (line.startsWith('-')) {
    return (
      <div key={idx} className="bg-red-500/10 text-red-300">
        {line}
      </div>
    );
  }
  return (
    <div key={idx} className="text-muted-foreground/70">
      {line}
    </div>
  );
}

// ─── Auto-refresh interval while drawer is open ───────────────────────────────

const POLL_MS = 5000;

// ─── Component ────────────────────────────────────────────────────────────────

export function DiffPanel() {
  const t = useT();
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDiff = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(API_PATHS.PLAYGROUNDS_DIFF, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DiffResult;
      setResult(data);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof Error ? e.message : t('diff.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Initial fetch
  useEffect(() => {
    void fetchDiff();
    return () => { abortRef.current?.abort(); };
  }, [fetchDiff]);

  // Auto-refresh every 5 s while mounted (panel is open)
  useEffect(() => {
    const id = setInterval(() => { void fetchDiff(); }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchDiff]);

  const lines = result?.diff.split('\n') ?? [];

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0d0d14] text-[13px] font-mono">
      {/* ── Sub-header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0d0d14]/90 border-b border-violet-500/10 shrink-0">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="size-3.5 text-violet-400 shrink-0" aria-hidden />
          <span className="text-[10px] font-medium text-violet-300/70 tracking-wide">
            git diff HEAD
          </span>
          {result && (
            <span className="text-[10px] text-muted-foreground/40">
              · {t('diff.filesChanged', { count: result.files.length })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { void fetchDiff(); }}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-violet-300 transition-colors disabled:opacity-40 shrink-0"
          aria-label={t('diff.refreshDiff')}
          title={t('diff.refresh')}
        >
          <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          <span>{t('diff.refresh')}</span>
        </button>
      </div>

      {/* ── Not a git repo ──────────────────────────────────────────────── */}
      {!loading && result && !result.isGitRepo && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground/50 px-6 text-center">
          <GitCompareArrows className="size-8 opacity-30" />
          <p className="text-xs">{t('diff.notGitRepo')}</p>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-400 shrink-0">
          {error}
        </div>
      )}

      {/* ── No changes ─────────────────────────────────────────────────── */}
      {!loading && !error && result?.isGitRepo && !result.hasDiff && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground/40 px-6 text-center">
          <GitCompareArrows className="size-8 opacity-20" />
          <p className="text-xs">{t('diff.noChanges')}</p>
        </div>
      )}

      {/* ── Changed files strip ─────────────────────────────────────────── */}
      {result?.files && result.files.length > 0 && (
        <div className="shrink-0 border-b border-violet-500/10 bg-[#0d0d14]/80 px-3 py-1.5 flex flex-col gap-0.5 max-h-36 overflow-y-auto">
          {result.files.map((f) => {
            const { labelKey, color, Icon } = fileStatusInfo(f.index, f.worktree);
            const label = t(labelKey satisfies TranslationKey);
            return (
              <div key={f.path} className="flex items-center gap-2 min-w-0">
                <Icon className={`size-3 shrink-0 ${color}`} aria-hidden />
                <span className="text-[11px] text-foreground/80 truncate min-w-0 flex-1" title={f.path}>
                  {f.path}
                </span>
                <span className={`text-[9px] font-medium uppercase tracking-wider shrink-0 ${color}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Diff output ─────────────────────────────────────────────────── */}
      {result?.diff && (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto px-3 py-2 leading-5 text-[12px] whitespace-pre">
          {lines.map((line, idx) => (
            <DiffLine key={idx} line={line} idx={idx} />
          ))}
        </div>
      )}
    </div>
  );
}
