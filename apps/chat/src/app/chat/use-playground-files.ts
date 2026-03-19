import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../api-url';
import { API_PATHS } from '@shared/api-paths';
import { REFETCH_WHEN_EMPTY_MS } from '../layout-constants';

export interface PlaygroundEntryItem {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

export interface PlaygroundTreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: PlaygroundTreeEntry[];
}

function flattenEntries(entries: PlaygroundTreeEntry[]): PlaygroundEntryItem[] {
  const out: PlaygroundEntryItem[] = [];
  for (const e of entries) {
    out.push({ path: e.path, name: e.name, type: e.type });
    if (e.type === 'directory' && e.children?.length) {
      out.push(...flattenEntries(e.children));
    }
  }
  return out;
}

function sortEntries(items: PlaygroundEntryItem[]): PlaygroundEntryItem[] {
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
}

export function usePlaygroundFiles(): {
  entries: PlaygroundEntryItem[];
  tree: PlaygroundTreeEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [tree, setTree] = useState<PlaygroundTreeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const entries = useMemo(
    () => sortEntries(flattenEntries(tree)),
    [tree]
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(API_PATHS.PLAYGROUNDS);
      if (res.status === 401) {
        setTree([]);
        return;
      }
      if (!res.ok) throw new Error('Failed to load playgrounds');
      const data = (await res.json()) as PlaygroundTreeEntry[];
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

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetchRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return { entries, tree, loading, error, refetch };
}
