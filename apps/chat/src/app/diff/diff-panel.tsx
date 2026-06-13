import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  FileMinus,
  FilePlus,
  FileQuestion,
  FileText,
  GitCommitHorizontal,
  GitCompareArrows,
  GitPullRequest,
  Loader2 as SpinnerIcon,
  RefreshCw,
  Square,
  Upload,
} from 'lucide-react';
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
  branch?: string;
  upstream?: string | null;
  counts?: { staged: number; unstaged: number; untracked: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a human-readable label + colour token for a status letter pair. */
function fileStatusInfo(index: string, worktree: string) {
  const combined = `${index}${worktree}`.replace(/ /g, '');
  if (combined.includes('?')) return { labelKey: 'diff.status.untracked' as const, color: 'text-amber-400', Icon: FileQuestion };
  if (combined.includes('A')) return { labelKey: 'diff.status.added' as const,     color: 'text-emerald-400', Icon: FilePlus };
  if (combined.includes('D')) return { labelKey: 'diff.status.deleted' as const,   color: 'text-red-400',     Icon: FileMinus };
  if (combined.includes('R')) return { labelKey: 'diff.status.renamed' as const,   color: 'text-blue-400',    Icon: FileText };
  return                                { labelKey: 'diff.status.modified' as const, color: 'text-primary',  Icon: FileText };
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
  const [busyAction, setBusyAction] = useState<'commit' | 'push' | 'pr' | null>(null);
  const [operationResult, setOperationResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set());
  const [commitMessage, setCommitMessage] = useState('');
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
      setSelectedFiles((current) => {
        const known = new Set(data.files.map((file) => file.path));
        const kept = new Set([...current].filter((file) => known.has(file)));
        return kept.size > 0 ? kept : known;
      });
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

  // Auto-dismiss operation result after 4 s
  useEffect(() => {
    if (!operationResult) return;
    const id = setTimeout(() => setOperationResult(null), 4000);
    return () => clearTimeout(id);
  }, [operationResult]);

  const selected = useMemo(() => [...selectedFiles], [selectedFiles]);
  const canCommit = selected.length > 0 && commitMessage.trim().length > 0 && !busyAction;

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const runGitAction = useCallback(async (
    action: 'commit' | 'push' | 'pr',
    request: () => Promise<Response>,
  ) => {
    setBusyAction(action);
    setOperationResult(null);
    try {
      const res = await request();
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { message?: string };
      setOperationResult({ ok: true, message: data.message ?? t('diff.gitOperationSuccess') });
      void fetchDiff();
    } catch (err) {
      setOperationResult({ ok: false, message: err instanceof Error ? err.message : t('diff.gitOperationFailed') });
    } finally {
      setBusyAction(null);
    }
  }, [fetchDiff, t]);

  const handleCommit = useCallback(() => runGitAction('commit', async () => {
    const stageRes = await apiRequest('/api/playgrounds/git-stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: selected, confirm: true }),
    });
    if (!stageRes.ok) return stageRes;
    return apiRequest('/api/playgrounds/git-commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: commitMessage, confirm: true }),
    });
  }), [commitMessage, runGitAction, selected]);

  const handlePush = useCallback(() => runGitAction('push', () => apiRequest('/api/playgrounds/git-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true, branch: result?.branch }),
  })), [result?.branch, runGitAction]);

  const handleDraftPr = useCallback(() => runGitAction('pr', () => apiRequest('/api/playgrounds/git-pr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  })), [runGitAction]);

  const lines = result?.diff.split('\n') ?? [];

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0d0d14] text-[13px] font-mono">
      {/* ── Sub-header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0d0d14]/90 border-b border-primary/10 shrink-0">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="size-3.5 text-primary shrink-0" aria-hidden />
          <span className="text-[10px] font-medium text-primary/70 tracking-wide">
            {result?.branch ? `git · ${result.branch}` : 'git diff HEAD'}
          </span>
          {result && (
            <span className="text-[10px] text-muted-foreground/40">
              · {t('diff.filesChanged', { count: result.files.length })}
              {result.counts ? ` · ${result.counts.staged}/${result.counts.unstaged}/${result.counts.untracked}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result?.hasDiff && (
            <button
              type="button"
              onClick={() => { void handleCommit(); }}
              disabled={!canCommit || loading}
              className="flex items-center gap-1 text-[10px] text-primary/80 hover:text-primary transition-colors disabled:opacity-40 shrink-0 rounded px-1.5 py-0.5 hover:bg-primary/10"
              aria-label={t('diff.commitSelected')}
              title={t('diff.commitSelected')}
            >
              {busyAction === 'commit'
                ? <SpinnerIcon className="size-3 animate-spin" aria-hidden />
                : <GitCommitHorizontal className="size-3" aria-hidden />
              }
              <span>{t('diff.commit')}</span>
            </button>
          )}
          {result?.branch && (
            <button
              type="button"
              onClick={() => { void handlePush(); }}
              disabled={Boolean(busyAction) || loading}
              className="flex items-center gap-1 text-[10px] text-emerald-400/80 hover:text-emerald-300 transition-colors disabled:opacity-40 shrink-0 rounded px-1.5 py-0.5 hover:bg-emerald-500/10"
              aria-label={t('drawer.gitPush')}
              title={t('drawer.gitPush')}
            >
              {busyAction === 'push'
                ? <SpinnerIcon className="size-3 animate-spin" aria-hidden />
                : <Upload className="size-3" aria-hidden />
              }
              <span>{t('diff.push')}</span>
            </button>
          )}
          {result?.upstream && (
            <button
              type="button"
              onClick={() => { void handleDraftPr(); }}
              disabled={Boolean(busyAction) || loading}
              className="flex items-center gap-1 text-[10px] text-blue-300/80 hover:text-blue-200 transition-colors disabled:opacity-40 shrink-0 rounded px-1.5 py-0.5 hover:bg-blue-500/10"
              aria-label={t('diff.createDraftPr')}
              title={t('diff.createDraftPr')}
            >
              {busyAction === 'pr'
                ? <SpinnerIcon className="size-3 animate-spin" aria-hidden />
                : <GitPullRequest className="size-3" aria-hidden />
              }
              <span>{t('diff.pr')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { void fetchDiff(); }}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors disabled:opacity-40 shrink-0"
            aria-label={t('diff.refreshDiff')}
            title={t('diff.refresh')}
          >
            <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            <span>{t('diff.refresh')}</span>
          </button>
        </div>
      </div>

      {/* ── Operation result toast ─────────────────────────────────────── */}
      {operationResult && (
        <div className={`px-3 py-1.5 text-[11px] font-medium shrink-0 border-b border-primary/10 ${
          operationResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {operationResult.message}
        </div>
      )}

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
        <div className="shrink-0 border-b border-primary/10 bg-[#0d0d14]/80 px-3 py-1.5 flex flex-col gap-0.5 max-h-36 overflow-y-auto">
          <div className="flex items-center gap-2 pb-1">
            <input
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.currentTarget.value)}
              placeholder={t('drawer.gitPushCommitMessage')}
              className="min-w-0 flex-1 rounded border border-primary/15 bg-black/20 px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50"
            />
            <span className="text-[10px] text-muted-foreground/50 shrink-0">
              {t('diff.selectedFiles', { count: selectedFiles.size })}
            </span>
          </div>
          {result.files.map((f) => {
            const { labelKey, color, Icon } = fileStatusInfo(f.index, f.worktree);
            const label = t(labelKey satisfies TranslationKey);
            const selected = selectedFiles.has(f.path);
            return (
              <button
                key={f.path}
                type="button"
                onClick={() => toggleFile(f.path)}
                className="flex items-center gap-2 min-w-0 rounded px-1 py-0.5 text-left hover:bg-primary/10"
                aria-pressed={selected}
              >
                {selected
                  ? <CheckSquare className="size-3 shrink-0 text-primary" aria-hidden />
                  : <Square className="size-3 shrink-0 text-muted-foreground/50" aria-hidden />
                }
                <Icon className={`size-3 shrink-0 ${color}`} aria-hidden />
                <span className="text-[11px] text-foreground/80 truncate min-w-0 flex-1" title={f.path}>
                  {f.path}
                </span>
                {f.index && f.index !== ' ' && f.index !== '?' && (
                  <span className="text-[9px] font-medium uppercase tracking-wider text-emerald-300/80 shrink-0">
                    {t('diff.staged')}
                  </span>
                )}
                {f.worktree && f.worktree !== ' ' && (
                  <span className="text-[9px] font-medium uppercase tracking-wider text-amber-300/80 shrink-0">
                    {t('diff.unstaged')}
                  </span>
                )}
                <span className={`text-[9px] font-medium uppercase tracking-wider shrink-0 ${color}`}>
                  {label}
                </span>
              </button>
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
