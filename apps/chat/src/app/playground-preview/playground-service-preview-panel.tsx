import { ExternalLink, RefreshCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { PlaygroundPreviewService } from './playground-services';

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
  const selected = useMemo(() => {
    if (services.length === 0) return null;
    return services.find((service) => service.id === selectedId) ?? services[0];
  }, [selectedId, services]);

  const iframeKey = selected ? `${selected.id}:${frameKey}` : `empty:${frameKey}`;

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label={t('preview.title')}>
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-card/70 px-3 py-2 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-foreground">{t('preview.title')}</h2>
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
          <iframe
            key={iframeKey}
            src={selected.url}
            title={t('preview.frameTitle', { service: selected.name })}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
          />
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
