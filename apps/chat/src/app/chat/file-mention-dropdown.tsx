import { useCallback, useEffect, useRef, useState } from 'react';
import { FileIcon } from '../file-icon';
import type { PlaygroundEntryItem } from './use-playground-files';

const MAX_VISIBLE = 8;

export function FileMentionDropdown({
  open,
  query,
  entries,
  onSelect,
  onClose,
  anchorRef,
}: {
  open: boolean;
  query: string;
  entries: PlaygroundEntryItem[];
  onSelect: (path: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim();
  const qLower = q.toLowerCase();
  const filtered = q
    ? entries
        .filter(
          (e) =>
            e.path.toLowerCase().includes(qLower) ||
            e.name.toLowerCase().includes(qLower)
        )
        .sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const aNameStarts = aName.startsWith(qLower) ? 0 : 1;
          const bNameStarts = bName.startsWith(qLower) ? 0 : 1;
          if (aNameStarts !== bNameStarts) return aNameStarts - bNameStarts;
          const aNameHas = aName.includes(qLower) ? 0 : 1;
          const bNameHas = bName.includes(qLower) ? 0 : 1;
          if (aNameHas !== bNameHas) return aNameHas - bNameHas;
          return a.path.localeCompare(b.path);
        })
    : entries;
  const slice = filtered.slice(0, MAX_VISIBLE);
  const hasMore = filtered.length > MAX_VISIBLE;

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const child = el.children[highlightIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((i) => (i < slice.length - 1 ? i + 1 : i));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((i) => (i > 0 ? i - 1 : 0));
        return;
      }
      const entry = slice[highlightIndex];
      if (e.key === 'Enter' && entry) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(entry.path);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose, onSelect, highlightIndex, slice]);

  const handleSelect = useCallback(
    (path: string) => {
      onSelect(path);
    },
    [onSelect]
  );

  if (!open) return null;

  return (
    <div
      ref={listRef}
      className="absolute left-0 right-0 bottom-full z-50 mb-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg"
      role="listbox"
      aria-label="Link playground file"
    >
      {slice.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {entries.length === 0 ? 'No files or folders in playground' : 'No matching files or folders'}
        </div>
      ) : (
        slice.map((entry, i) => (
          <button
            key={entry.path}
            type="button"
            role="option"
            aria-selected={i === highlightIndex}
            title={entry.path}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
              i === highlightIndex
                ? 'bg-violet-500/15 text-foreground'
                : 'text-foreground hover:bg-muted/60'
            }`}
            onMouseEnter={() => setHighlightIndex(i)}
            onClick={() => handleSelect(entry.path)}
          >
            <FileIcon
              pathOrName={entry.path}
              isDirectory={entry.type === 'directory'}
              size={12}
              className="shrink-0"
            />
            <span className="min-w-0 truncate font-medium">{entry.name}</span>
          </button>
        ))
      )}
      {hasMore && (
        <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          +{filtered.length - MAX_VISIBLE} more — type to filter
        </div>
      )}
    </div>
  );
}

function looksLikeCompletePath(pathPart: string): boolean {
  return pathPart.includes('/') || /\.[a-zA-Z0-9]{2,}$/.test(pathPart);
}

export function valueAfterAtMatchesEntry(
  value: string,
  entries: { path: string; name: string }[]
): boolean {
  const lastAt = value.lastIndexOf('@');
  if (lastAt === -1) return false;
  const token = value.slice(lastAt + 1).split(/[\s\n]/)[0] ?? '';
  if (!token) return false;
  return entries.some((e) => e.path === token || e.name === token);
}

export function getAtMentionState(
  value: string,
  cursorOffset: number
): { show: boolean; query: string; replaceStart: number } {
  const beforeCursor = value.slice(0, cursorOffset);
  const atIndex = beforeCursor.lastIndexOf('@');
  if (atIndex === -1) return { show: false, query: '', replaceStart: -1 };
  const afterAt = beforeCursor.slice(atIndex + 1);
  if (afterAt.includes(' ') || afterAt.includes('\n')) return { show: false, query: '', replaceStart: -1 };
  if (cursorOffset === value.length && /@[^\s@]+$/.test(value)) {
    const pathPart = value.slice(value.lastIndexOf('@') + 1);
    if (looksLikeCompletePath(pathPart)) return { show: false, query: '', replaceStart: -1 };
  }
  return { show: true, query: afterAt, replaceStart: atIndex };
}
