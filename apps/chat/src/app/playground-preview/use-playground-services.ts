import { useCallback, useEffect, useRef, useState } from 'react';
import { API_PATHS } from '@shared/api-paths';
import { apiRequest } from '../api-url';
import {
  normalizePlaygroundServices,
  type PlaygroundPreviewService,
} from './playground-services';

type ParentPreviewMessage = {
  type?: string;
  services?: unknown;
  urls?: unknown;
};

export function usePlaygroundServices(selectedPlayground?: string | null) {
  const [services, setServices] = useState<PlaygroundPreviewService[]>([]);
  const [loading, setLoading] = useState(true);
  const parentProvidedRef = useRef(false);
  const playground = selectedPlayground?.trim() ?? '';

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const path = playground
        ? `${API_PATHS.PLAYGROUNDS_URLS}?playground=${encodeURIComponent(playground)}`
        : API_PATHS.PLAYGROUNDS_URLS;
      const res = await apiRequest(path, { signal }).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json();
      if (parentProvidedRef.current && !playground) return;
      setServices(normalizePlaygroundServices(data?.services ?? data?.urls, 'cli'));
    } finally {
      setLoading(false);
    }
  }, [playground]);

  useEffect(() => {
    const ac = new AbortController();
    void refresh(ac.signal);
    return () => ac.abort();
  }, [refresh]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as ParentPreviewMessage | undefined;
      if (!data || data.type !== 'fibe_preview_services') return;

      const next = normalizePlaygroundServices(data.services ?? data.urls, 'parent');
      parentProvidedRef.current = true;
      setServices(next);
      setLoading(false);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return { services, loading, refresh };
}
