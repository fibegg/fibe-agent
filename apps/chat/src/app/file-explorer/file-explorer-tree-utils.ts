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

const GIT_STATUS_PRIORITY: Record<NonNullable<PlaygroundEntry['gitStatus']>, number> = {
  deleted: 5,
  renamed: 4,
  modified: 3,
  added: 2,
  untracked: 1,
};

function strongerGitStatus(
  current: PlaygroundEntry['gitStatus'],
  next: PlaygroundEntry['gitStatus']
): PlaygroundEntry['gitStatus'] {
  if (!next) return current;
  if (!current) return next;
  return GIT_STATUS_PRIORITY[next] > GIT_STATUS_PRIORITY[current] ? next : current;
}

export function withInheritedGitStatus(entries: PlaygroundEntry[]): PlaygroundEntry[] {
  function decorate(entry: PlaygroundEntry): PlaygroundEntry {
    if (entry.type !== 'directory') return entry;

    const children = (entry.children ?? []).map(decorate);
    const childStatus = children.reduce<PlaygroundEntry['gitStatus']>(
      (status, child) => strongerGitStatus(status, child.gitStatus),
      undefined
    );
    const gitStatus = strongerGitStatus(entry.gitStatus, childStatus);

    return {
      ...entry,
      children,
      ...(gitStatus ? { gitStatus } : {}),
    };
  }

  return entries.map(decorate);
}

export function withEntrySource(entries: PlaygroundEntry[], source: NonNullable<PlaygroundEntry['source']>): PlaygroundEntry[] {
  return entries.map((entry) => ({
    ...entry,
    source,
    ...(entry.children ? { children: withEntrySource(entry.children, source) } : {}),
  }));
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

export function mergeAnimatingRemoved(
  prev: PlaygroundEntry[],
  next: PlaygroundEntry[],
  animating: Map<string, FileAnimationType>
): PlaygroundEntry[] {
  let hasRemoved = false;
  for (const type of animating.values()) {
    if (type === 'removed') {
      hasRemoved = true;
      break;
    }
  }
  if (!hasRemoved) return next;

  const nextKeys = new Set(collectEntryMap(next).keys());

  function mergeLevel(pList: PlaygroundEntry[], nList: PlaygroundEntry[]): PlaygroundEntry[] {
    const out = [...nList];
    for (const p of pList) {
      if (!nextKeys.has(p.path)) {
        out.push(p);
      } else if (p.type === 'directory' && p.children) {
        const nIdx = out.findIndex((n) => n.path === p.path);
        if (nIdx !== -1) {
          const nMatch = out[nIdx];
          if (nMatch.type === 'directory') {
            out[nIdx] = { ...nMatch, children: mergeLevel(p.children, nMatch.children || []) };
          }
        }
      }
    }
    out.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  return mergeLevel(prev, next);
}

export interface FlatTreeNode {
  entry: PlaygroundEntry;
  depth: number;
}

export interface FlatFileEntry {
  entry: PlaygroundEntry;
  source: NonNullable<PlaygroundEntry['source']>;
}

export function flattenFiles(entries: PlaygroundEntry[]): FlatFileEntry[] {
  const result: FlatFileEntry[] = [];

  function visit(entry: PlaygroundEntry, source: PlaygroundEntry['source']) {
    const currentSource = entry.source ?? source;
    if (entry.type === 'file' && currentSource) {
      result.push({ entry: { ...entry, source: currentSource }, source: currentSource });
      return;
    }
    for (const child of entry.children ?? []) {
      visit(child, currentSource);
    }
  }

  for (const entry of entries) visit(entry, entry.source);
  return result;
}

export function flattenTree(
  entries: PlaygroundEntry[],
  expanded: Set<string>,
  depth = 0
): FlatTreeNode[] {
  const result: FlatTreeNode[] = [];
  for (const entry of entries) {
    result.push({ entry, depth });
    if (entry.type === 'directory' && entry.children && expanded.has(entry.path)) {
      result.push(...flattenTree(entry.children, expanded, depth + 1));
    }
  }
  return result;
}
