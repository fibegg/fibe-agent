import { describe, it, expect } from 'vitest';
import type { PlaygroundEntry } from './file-explorer-types';
import {
  getDirPathsAtDepth,
  findEntryByPath,
  filterTreeByQuery,
  diffTrees,
  mergeAnimatingRemoved,
} from './file-explorer-tree-utils';

// Helper factories
function file(name: string, path: string, mtime?: number): PlaygroundEntry {
  return { name, path, type: 'file' as const, mtime };
}

function dir(name: string, path: string, children: PlaygroundEntry[] = [], mtime?: number): PlaygroundEntry {
  return { name, path, type: 'directory' as const, children, mtime };
}

describe('getDirPathsAtDepth', () => {
  const tree = [
    dir('src', 'src', [
      dir('app', 'src/app', [
        dir('chat', 'src/app/chat'),
      ]),
      file('main.ts', 'src/main.ts'),
    ]),
    dir('tests', 'tests'),
    file('readme.md', 'readme.md'),
  ];

  it('returns top-level directory paths at depth 0', () => {
    const result = getDirPathsAtDepth(tree, 0);
    expect(result).toEqual(['src', 'tests']);
  });

  it('returns second-level directory paths at depth 1', () => {
    const result = getDirPathsAtDepth(tree, 1);
    expect(result).toEqual(['src/app']);
  });

  it('returns third-level directory paths at depth 2', () => {
    const result = getDirPathsAtDepth(tree, 2);
    expect(result).toEqual(['src/app/chat']);
  });

  it('returns empty array when depth exceeds tree depth', () => {
    const result = getDirPathsAtDepth(tree, 10);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty tree', () => {
    expect(getDirPathsAtDepth([], 0)).toEqual([]);
  });

  it('skips directories without children at depth > 0', () => {
    const simple = [dir('empty', 'empty')];
    expect(getDirPathsAtDepth(simple, 1)).toEqual([]);
  });
});

describe('findEntryByPath', () => {
  const tree = [
    dir('src', 'src', [
      file('main.ts', 'src/main.ts'),
      dir('app', 'src/app', [
        file('app.ts', 'src/app/app.ts'),
      ]),
    ]),
  ];

  it('finds a top-level directory', () => {
    const result = findEntryByPath(tree, 'src');
    expect(result?.path).toBe('src');
  });

  it('finds a nested file', () => {
    const result = findEntryByPath(tree, 'src/main.ts');
    expect(result?.path).toBe('src/main.ts');
  });

  it('finds a deeply nested file', () => {
    const result = findEntryByPath(tree, 'src/app/app.ts');
    expect(result?.path).toBe('src/app/app.ts');
  });

  it('returns null for missing path', () => {
    expect(findEntryByPath(tree, 'nonexistent')).toBeNull();
  });

  it('returns null for empty tree', () => {
    expect(findEntryByPath([], 'src')).toBeNull();
  });
});

describe('filterTreeByQuery', () => {
  const tree = [
    dir('src', 'src', [
      file('main.ts', 'src/main.ts'),
      file('helper.ts', 'src/helper.ts'),
      dir('components', 'src/components', [
        file('button.tsx', 'src/components/button.tsx'),
      ]),
    ]),
    file('readme.md', 'readme.md'),
  ];

  it('returns entire tree when query is empty', () => {
    const result = filterTreeByQuery(tree, '');
    expect(result).toEqual(tree);
  });

  it('returns entire tree when query is whitespace', () => {
    const result = filterTreeByQuery(tree, '   ');
    expect(result).toEqual(tree);
  });

  it('filters to files whose name matches query', () => {
    const result = filterTreeByQuery(tree, 'main');
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('directory');
    const srcDir = result[0];
    expect(srcDir.children?.some(c => c.name === 'main.ts')).toBe(true);
  });

  it('includes directory whose name matches (with all children)', () => {
    const result = filterTreeByQuery(tree, 'components');
    const srcDir = result.find(e => e.path === 'src');
    const comps = srcDir?.children?.find(e => e.name === 'components');
    expect(comps).toBeTruthy();
  });

  it('returns empty array when nothing matches', () => {
    const result = filterTreeByQuery(tree, 'xyzxyz');
    expect(result).toEqual([]);
  });

  it('is case-insensitive', () => {
    const result = filterTreeByQuery(tree, 'MAIN');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('diffTrees', () => {
  it('marks new files as added', () => {
    const prev = [file('a.ts', 'a.ts')];
    const next = [file('a.ts', 'a.ts'), file('b.ts', 'b.ts')];
    const diff = diffTrees(prev, next);
    expect(diff.get('b.ts')).toBe('added');
  });

  it('marks removed files', () => {
    const prev = [file('a.ts', 'a.ts'), file('b.ts', 'b.ts')];
    const next = [file('a.ts', 'a.ts')];
    const diff = diffTrees(prev, next);
    expect(diff.get('b.ts')).toBe('removed');
  });

  it('marks modified files (mtime changed)', () => {
    const prev = [file('a.ts', 'a.ts', 1000)];
    const next = [file('a.ts', 'a.ts', 2000)];
    const diff = diffTrees(prev, next);
    expect(diff.get('a.ts')).toBe('modified');
  });

  it('does not mark unchanged files', () => {
    const prev = [file('a.ts', 'a.ts', 1000)];
    const next = [file('a.ts', 'a.ts', 1000)];
    const diff = diffTrees(prev, next);
    expect(diff.size).toBe(0);
  });

  it('handles nested entries', () => {
    const prev = [dir('src', 'src', [file('a.ts', 'src/a.ts', 100)])];
    const next = [dir('src', 'src', [file('a.ts', 'src/a.ts', 200)])];
    const diff = diffTrees(prev, next);
    expect(diff.get('src/a.ts')).toBe('modified');
  });

  it('returns empty map for identical trees', () => {
    const tree = [dir('src', 'src', [file('a.ts', 'src/a.ts')])];
    const diff = diffTrees(tree, tree);
    // Files without mtime: both undefined → not modified
    expect(diff.size).toBe(0);
  });
});

describe('mergeAnimatingRemoved', () => {
  it('returns next directly when no removed entries in animating', () => {
    const prev = [file('a.ts', 'a.ts')];
    const next = [file('a.ts', 'a.ts'), file('b.ts', 'b.ts')];
    const animating = new Map([['b.ts', 'added' as const]]);
    const result = mergeAnimatingRemoved(prev, next, animating);
    expect(result).toBe(next);
  });

  it('merges removed entries from prev into next', () => {
    const prev = [file('a.ts', 'a.ts'), file('gone.ts', 'gone.ts')];
    const next = [file('a.ts', 'a.ts')];
    const animating = new Map([['gone.ts', 'removed' as const]]);
    const result = mergeAnimatingRemoved(prev, next, animating);
    expect(result.some((e: PlaygroundEntry) => e.path === 'gone.ts')).toBe(true);
  });

  it('sorts directories before files in merged result', () => {
    const gone = dir('old-dir', 'old-dir');
    const prev = [file('z.ts', 'z.ts'), gone];
    const next = [file('a.ts', 'a.ts')];
    const animating = new Map([['old-dir', 'removed' as const]]);
    const result = mergeAnimatingRemoved(prev, next, animating);
    expect(result[0].type).toBe('directory');
  });

  it('recursively merges removed children', () => {
    const prevChild = file('old.ts', 'src/old.ts');
    const prev = [dir('src', 'src', [file('a.ts', 'src/a.ts'), prevChild])];
    const next = [dir('src', 'src', [file('a.ts', 'src/a.ts')])];
    const animating = new Map([['src/old.ts', 'removed' as const]]);
    const result = mergeAnimatingRemoved(prev, next, animating);
    const srcDir = result.find((e: PlaygroundEntry) => e.path === 'src');
    expect(srcDir?.children?.some((c: PlaygroundEntry) => c.path === 'src/old.ts')).toBe(true);
  });
});
