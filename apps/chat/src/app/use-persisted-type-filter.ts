import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'fibe:activityTypeFilter';
const SYNC_EVENT = 'fibe:typeFilterSync';

function readFilter(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed as string[];
    }
    // Migrate from old single-string format
    if (typeof parsed === 'string') return [parsed];
    return [];
  } catch {
    // Could be old single-string format (not JSON)
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && typeof raw === 'string' && !raw.startsWith('[')) return [raw];
    } catch { /* ignore */ }
    return [];
  }
}

function writeFilter(value: string[]): void {
  try {
    if (value.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
  } catch {
    /* localStorage not available */
  }
}

export function usePersistedTypeFilter(): [string[], (filter: string[]) => void] {
  const [filter, setFilterState] = useState<string[]>(() => readFilter());

  const setFilter = useCallback((value: string[]) => {
    setFilterState(value);
    writeFilter(value);
    // Sync across hook instances within the same page
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: value }));
  }, []);

  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<string[]>).detail;
      setFilterState(detail);
    };
    // Cross-tab sync
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFilterState(readFilter());
    };
    window.addEventListener(SYNC_EVENT, onSync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return [filter, setFilter];
}
