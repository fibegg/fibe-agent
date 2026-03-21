import type { PlaygroundEntry } from './file-explorer-types';

export function getDirPathsAtDepth(entries: PlaygroundEntry[], depth: number): string[] {
  if (depth === 0) {
    return entries.filter((e) => e.type === 'directory').map((e) => e.path);
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.type === 'directory' && e.children?.length) {
      if (depth === 1) {
        e.children.filter((c) => c.type === 'directory').forEach((c) => out.push(c.path));
      } else {
        out.push(...getDirPathsAtDepth(e.children, depth - 1));
      }
    }
  }
  return out;
}

export function findEntryByPath(entries: PlaygroundEntry[], path: string): PlaygroundEntry | null {
  for (const e of entries) {
    if (e.path === path) return e;
    if (e.children?.length) {
      const found = findEntryByPath(e.children, path);
      if (found) return found;
    }
  }
  return null;
}

export function filterTreeByQuery(entries: PlaygroundEntry[], query: string): PlaygroundEntry[] {
  if (!query.trim()) return entries;
  const lower = query.trim().toLowerCase();
  function build(entry: PlaygroundEntry): PlaygroundEntry | null {
    if (entry.type === 'file') {
      return entry.name.toLowerCase().includes(lower) ? entry : null;
    }
    const childResults = (entry.children ?? [])
      .map(build)
      .filter((c): c is PlaygroundEntry => c != null);
    if (entry.name.toLowerCase().includes(lower) || childResults.length > 0) {
      return { ...entry, children: childResults.length ? childResults : entry.children };
    }
    return null;
  }
  return entries.map(build).filter((e): e is PlaygroundEntry => e != null);
}

export type FileAnimationType = 'added' | 'removed' | 'modified';

function collectEntryMap(entries: PlaygroundEntry[]): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>();
  for (const e of entries) {
    out.set(e.path, e.mtime);
    if (e.type === 'directory' && e.children?.length) {
      for (const [p, m] of collectEntryMap(e.children)) out.set(p, m);
    }
  }
  return out;
}

export function diffTrees(
  prev: PlaygroundEntry[],
  next: PlaygroundEntry[]
): Map<string, FileAnimationType> {
  const result = new Map<string, FileAnimationType>();
  const prevMap = collectEntryMap(prev);
  const nextMap = collectEntryMap(next);
  for (const [p, mtime] of nextMap) {
    if (!prevMap.has(p)) {
      result.set(p, 'added');
    } else {
      const prevMtime = prevMap.get(p);
      if (mtime != null && prevMtime != null && mtime !== prevMtime) {
        result.set(p, 'modified');
      }
    }
  }
  for (const p of prevMap.keys()) {
    if (!nextMap.has(p)) result.set(p, 'removed');
  }
  return result;
}
