import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../api-url';
import { API_PATHS } from '@shared/api-paths';
import { REFETCH_WHEN_EMPTY_MS } from '../layout-constants';

const POLL_INTERVAL_MS = 5000;

export interface AgentFileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: AgentFileEntry[];
}

function flattenEntries(entries: AgentFileEntry[]): AgentFileEntry[] {
  const out: AgentFileEntry[] = [];
  for (const e of entries) {
    out.push(e);
    if (e.type === 'directory' && e.children?.length) {
      out.push(...flattenEntries(e.children));
    }
  }
  return out;
}

export function useAgentFiles(): {
  tree: AgentFileEntry[];
  loading: boolean;
  hasFiles: boolean;
  stats: { fileCount: number; totalLines: number };
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [tree, setTree] = useState<AgentFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ fileCount: number; totalLines: number }>({ fileCount: 0, totalLines: 0 });

  const hasFiles = useMemo(() => flattenEntries(tree).length > 0, [tree]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(API_PATHS.AGENT_FILES);
      if (res.status === 401) {
        setTree([]);
        return;
      }
      if (!res.ok) throw new Error('Failed to load agent files');
      const data = (await res.json()) as AgentFileEntry[];
      setTree(Array.isArray(data) ? data : []);
    } catch (e) {
      setTree([]);
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (tree.length > 0 || loading) return;
    const id = setInterval(() => void refetch(), REFETCH_WHEN_EMPTY_MS);
    return () => clearInterval(id);
  }, [tree.length, loading, refetch]);

  // Regular polling for live updates
  useEffect(() => {
    if (tree.length === 0) return;
    const id = setInterval(() => void refetch(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [tree.length, refetch]);

  // Stats fetching
  const fetchStats = useCallback(async () => {
    try {
      const res = await apiRequest(API_PATHS.AGENT_FILES_STATS);
      if (res.ok) {
        const data = await res.json() as { fileCount: number; totalLines: number };
        setStats(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (tree.length === 0) return;
    void fetchStats();
  }, [tree, fetchStats]);

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetchRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return { tree, loading, hasFiles, stats, error, refetch };
}
