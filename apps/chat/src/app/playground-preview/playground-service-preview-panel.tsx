import { AlertTriangle, CheckCircle2, ExternalLink, Info, RefreshCcw, ShieldAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { PlaygroundPreviewService } from './playground-services';
import { fetchPreviewDiagnostics, type PreviewDiagnosticsResult } from './preview-diagnostics';

export function PlaygroundServicePreviewPanel({
  services,
  initialServiceId,
  loading = false,
  onClose,
  onRefresh,
}: {
  services: PlaygroundPreviewService[];
  initialServiceId?: string | null;
  loading?: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const t = useT();
  const [selectedId, setSelectedId] = useState(initialServiceId ?? '');
  const [frameKey, setFrameKey] = useState(0);
  const [diagnostics, setDiagnostics] = useState<PreviewDiagnosticsResult | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const selected = useMemo(() => {
    if (services.length === 0) return null;
    return services.find((service) => service.id === selectedId) ?? services[0];
  }, [selectedId, services]);

  const iframeKey = selected ? `${selected.id}:${frameKey}` : `empty:${frameKey}`;
  const criticalIssueCount = diagnostics?.issues.filter((issue) => issue.severity === 'error').length ?? 0;
  const warningIssueCount = diagnostics?.issues.filter((issue) => issue.severity === 'warning').length ?? 0;

  useEffect(() => {
    if (!selected) {
      setDiagnostics(null);
      setDiagnosticsError('');
      setDiagnosticsLoading(false);
      return;
    }

    const ac = new AbortController();
    setDiagnosticsLoading(true);
    setDiagnosticsError('');
    void fetchPreviewDiagnostics(selected.url, ac.signal)
      .then(setDiagnostics)
      .catch((error: unknown) => {
        if ((error as Error).name === 'AbortError') return;
        setDiagnostics(null);
        setDiagnosticsError(error instanceof Error ? error.message : t('preview.diagnosticsFailed'));
      })
      .finally(() => {
        if (!ac.signal.aborted) setDiagnosticsLoading(false);
      });
    return () => ac.abort();
  }, [selected, frameKey, t]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label={t('preview.title')}>
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-card/70 px-3 py-2 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-foreground">{t('preview.title')}</h2>
          {selected && (
            <span
              className={`hidden shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex ${
                criticalIssueCount > 0
                  ? 'bg-red-500/15 text-red-300'
                  : warningIssueCount > 0
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-300'
              }`}
              title={t('preview.diagnostics')}
            >
              {criticalIssueCount > 0 ? <ShieldAlert className="size-3" /> : warningIssueCount > 0 ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}
              {diagnosticsLoading ? t('preview.checking') : criticalIssueCount > 0 ? t('preview.errorsCount', { count: criticalIssueCount }) : warningIssueCount > 0 ? t('preview.warningsCount', { count: warningIssueCount }) : t('preview.noIssues')}
            </span>
          )}
          {services.length > 1 && (
            <div className="flex min-w-0 items-center gap-1 rounded-md border border-border/60 bg-background/50 p-0.5" aria-label={t('preview.serviceSelector')}>
              {services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => setSelectedId(service.id)}
                  className={`max-w-28 truncate rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    selected?.id === service.id
                      ? 'bg-violet-500/20 text-violet-200'
                      : 'text-muted-foreground hover:bg-violet-500/10 hover:text-foreground'
                  }`}
                  aria-pressed={selected?.id === service.id}
                  title={service.name}
                >
                  {service.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onRefresh?.();
              setDiagnostics(null);
              setFrameKey((key) => key + 1);
            }}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-300"
            aria-label={t('preview.reload')}
            title={t('preview.reload')}
          >
            <RefreshCcw className="size-4" />
          </button>
          {selected && (
            <a
              href={selected.url}
              target="_blank"
              rel="noreferrer"
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-300"
              aria-label={t('preview.openExternal')}
              title={t('preview.openExternal')}
            >
              <ExternalLink className="size-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-300"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-white">
        {selected ? (
          <>
            <PreviewDiagnosticsBanner
              diagnostics={diagnostics}
              loading={diagnosticsLoading}
              error={diagnosticsError}
            />
            <iframe
              key={iframeKey}
              src={selected.url}
              title={t('preview.frameTitle', { service: selected.name })}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
            />
          </>
        ) : (
          <div className="grid h-full place-items-center bg-background px-6 text-center">
            <div className="max-w-sm">
              <p className="text-sm font-medium text-foreground">
                {loading ? t('preview.loading') : t('preview.emptyTitle')}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t('preview.emptyBody')}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PreviewDiagnosticsBanner({
  diagnostics,
  loading,
  error,
}: {
  diagnostics: PreviewDiagnosticsResult | null;
  loading: boolean;
  error: string;
}) {
  const t = useT();
  const importantIssues = diagnostics?.issues.filter((issue) => issue.severity !== 'info').slice(0, 4) ?? [];
  const infoIssues = diagnostics?.issues.filter((issue) => issue.severity === 'info').slice(0, 2) ?? [];
  const visibleIssues = importantIssues.length > 0 ? importantIssues : infoIssues;

  if (loading && !diagnostics) {
    return (
      <div className="absolute left-3 right-3 top-3 z-10 rounded-md border border-border/70 bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-lg shadow-black/10 backdrop-blur">
        {t('preview.checkingDiagnostics')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute left-3 right-3 top-3 z-10 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-amber-200 shadow-lg shadow-black/10 backdrop-blur">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (visibleIssues.length === 0) return null;

  return (
    <div className="absolute left-3 right-3 top-3 z-10 max-h-40 overflow-auto rounded-md border border-border/70 bg-background/95 p-2 text-xs shadow-lg shadow-black/10 backdrop-blur">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
        <AlertTriangle className="size-3.5 text-amber-300" />
        {t('preview.diagnostics')}
      </div>
      <div className="flex flex-col gap-1.5">
        {visibleIssues.map((issue) => (
          <div key={`${issue.code}:${issue.detail}`} className="flex gap-2 rounded border border-border/50 bg-card/60 px-2 py-1.5">
            {issue.severity === 'error' ? (
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-red-300" />
            ) : issue.severity === 'warning' ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
            ) : (
              <Info className="mt-0.5 size-3.5 shrink-0 text-blue-300" />
            )}
            <div className="min-w-0">
              <div className="font-medium text-foreground">{issue.title}</div>
              <div className="mt-0.5 break-words text-muted-foreground">{issue.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
