import { useCallback, useMemo, useState, useRef } from 'react';
import { apiRequest } from '../api-url';
import { API_PATHS } from '@shared/api-paths';

export interface BrowseEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
}

export function usePlaygroundSelector() {
  const [browsePath, setBrowsePath] = useState('');
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLink, setCurrentLink] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const autoMountedRef = useRef(false);

  const fetchEntries = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = path
        ? `${API_PATHS.PLAYROOMS_BROWSE}?path=${encodeURIComponent(path)}`
        : API_PATHS.PLAYROOMS_BROWSE;
      const res = await apiRequest(url);
      if (!res.ok) throw new Error(res.status === 404 ? 'Path not found' : 'Failed to browse');
      const data = (await res.json()) as BrowseEntry[];
      setEntries(Array.isArray(data) ? data : []);
      setBrowsePath(path);
    } catch (e) {
      setEntries([]);
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCurrentLink = useCallback(async () => {
    try {
      const res = await apiRequest(API_PATHS.PLAYROOMS_CURRENT);
      if (res.ok) {
        const data = (await res.json()) as { current: string | null };
        setCurrentLink(data.current);
        return data.current;
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const browseTo = useCallback((path: string) => {
    setPathHistory((prev) => [...prev, browsePath]);
    void fetchEntries(path);
  }, [browsePath, fetchEntries]);

  const goBack = useCallback(() => {
    setPathHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      void fetchEntries(prev[prev.length - 1]);
      return next;
    });
  }, [fetchEntries]);

  const goToRoot = useCallback(() => {
    setPathHistory([]);
    void fetchEntries('');
  }, [fetchEntries]);

  const linkPlayground = useCallback(async (path: string): Promise<boolean> => {
    setLinking(true);
    try {
      const res = await apiRequest(API_PATHS.PLAYROOMS_LINK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        setError(res.status === 404 ? 'Target not found' : 'Failed to link playground');
        return false;
      }
      setCurrentLink(path);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Link failed');
      return false;
    } finally {
      setLinking(false);
    }
  }, []);

  const smartMount = useCallback(async (): Promise<boolean> => {
    if (linking) return false;
    setLinking(true);
    setError(null);
    try {
      const res = await apiRequest(API_PATHS.PLAYROOMS_BROWSE);
      if (!res.ok) throw new Error('Failed to fetch playgrounds for smart mount');
      const rootEntries = (await res.json()) as BrowseEntry[];
      
      const firstDir = rootEntries.find(e => e.type === 'directory' || e.type === 'symlink');
      if (!firstDir) {
        setError('No available playgrounds found');
        return false;
      }

      const linkRes = await apiRequest(API_PATHS.PLAYROOMS_LINK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: firstDir.path }),
      });

      if (!linkRes.ok) {
        throw new Error('Failed to smart mount target');
      }

      setCurrentLink(firstDir.path);
      // Ensure we fetch entries to refresh view if open
      void fetchEntries('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Smart mount failed');
      return false;
    } finally {
      setLinking(false);
    }
  }, [linking, fetchEntries]);

  const open = useCallback(async () => {
    void fetchEntries('');
    const link = await fetchCurrentLink();
    if (!link && !autoMountedRef.current) {
      autoMountedRef.current = true;
      void smartMount();
    }
  }, [fetchEntries, fetchCurrentLink, smartMount]);

  const canGoBack = pathHistory.length > 0;
  const breadcrumbs = useMemo(
    () => (browsePath ? browsePath.split('/').filter(Boolean) : []),
    [browsePath],
  );

  return {
    browsePath,
    entries,
    loading,
    error,
    currentLink,
    linking,
    canGoBack,
    breadcrumbs,
    browseTo,
    goBack,
    goToRoot,
    linkPlayground,
    smartMount,
    open,
  };
}
