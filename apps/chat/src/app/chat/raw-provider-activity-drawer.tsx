import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, RefreshCcw } from 'lucide-react';
import { API_PATHS } from '@shared/api-paths';
import { apiRequest } from '../api-url';
import { useT } from '../i18n';
import { copyTextToClipboard } from '../browser-compat';

interface RawProviderRecord {
  id: string;
  timestamp: string;
  provider: string;
  request?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string | null;
    bodyTruncated?: boolean;
  };
  response?: {
    statusCode?: number;
    statusMessage?: string;
    headers?: Record<string, string>;
    body?: string | null;
    bodyTruncated?: boolean;
  };
  durationMs?: number;
  error?: string | null;
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function JsonSection({ title, value }: { title: string; value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    if (await copyTextToClipboard(value)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } else {
      setCopied(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border/40 bg-background/45">
      <div className="flex items-center justify-between gap-3 border-b border-border/30 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!value}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('settings.raw.copySection', { title: title.toLowerCase() })}
          title={t('settings.raw.copySection', { title: title.toLowerCase() })}
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto p-3 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
        {value || '{}'}
      </pre>
    </section>
  );
}

export function RawProviderActivityDrawerContent({ open }: { open: boolean }) {
  const t = useT();
  const [records, setRecords] = useState<RawProviderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(API_PATHS.PROVIDER_TRAFFIC);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as RawProviderRecord[];
      setRecords(Array.isArray(data) ? data.slice().reverse() : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.raw.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const emptyMessage = useMemo(() => {
    if (loading) return t('settings.raw.loading');
    if (error) return error;
    return t('settings.raw.empty');
  }, [error, loading, t]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <span className="text-sm text-muted-foreground">{t('settings.raw.pairs', { count: records.length })}</span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label={t('settings.raw.refresh')}
          title={t('settings.raw.refreshShort')}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {records.length === 0 ? (
          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : records.map((record) => {
          const requestText = formatJson({ headers: record.request?.headers, body: record.request?.body });
          const responseText = formatJson({ headers: record.response?.headers, body: record.response?.body });

          return (
          <details key={record.id} className="overflow-hidden rounded-lg border border-border/50 bg-muted/10 shadow-sm">
            <summary className="cursor-pointer border-b border-transparent px-3 py-2.5 hover:bg-muted/25">
              <div className="inline-flex max-w-full items-center gap-2 text-sm">
                <span className="rounded-md border border-border/40 bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {record.request?.method || 'REQ'}
                </span>
                <span className="truncate text-foreground">{record.request?.url || record.provider}</span>
                {record.response?.statusCode && (
                  <span className="shrink-0 text-xs text-muted-foreground">{record.response.statusCode}</span>
                )}
                {typeof record.durationMs === 'number' && (
                  <span className="shrink-0 text-xs text-muted-foreground">{record.durationMs}ms</span>
                )}
              </div>
            </summary>
            <div className="space-y-3 border-t border-border/40 p-3">
              {record.error && <p className="text-sm text-destructive">{record.error}</p>}
              <JsonSection title={t('settings.raw.request')} value={requestText} />
              <JsonSection title={t('settings.raw.response')} value={responseText} />
            </div>
          </details>
          );
        })}
      </div>
    </div>
  );
}
