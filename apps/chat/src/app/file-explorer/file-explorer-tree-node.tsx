import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { memo, useCallback } from 'react';
import { FileIcon } from '../file-icon';
import type { PlaygroundEntry } from './file-explorer-types';
import type { FileAnimationType } from './file-explorer-tree-utils';
import { TREE_NODE_BASE, TREE_NODE_SELECTED } from '../ui-classes';
import { useT } from '../i18n';

export const TreeNode = memo(function TreeNode({
  entry,
  depth,
  isExpanded,
  isSelected,
  isDirty,
  animType,
  onToggle,
  onFileClick,
}: {
  entry: PlaygroundEntry;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  isDirty: boolean;
  animType: FileAnimationType | undefined;
  onToggle: (path: string) => void;
  onFileClick?: (entry: PlaygroundEntry) => void;
}) {
  const t = useT();
  const isDir = entry.type === 'directory';
  const hasChildren = isDir && (entry.children?.length ?? 0) > 0;

  const handleClick = useCallback(() => {
    if (isDir) {
      onToggle(entry.path);
    } else if (onFileClick) {
      onFileClick(entry);
    }
  }, [isDir, entry, onToggle, onFileClick]);

  const animClass = animType === 'added' ? 'animate-file-added' : animType === 'removed' ? 'animate-file-removed' : animType === 'modified' ? 'animate-file-modified' : '';

  const isGitModified = entry.gitStatus === 'modified';
  const isGitAddedOrUntracked = entry.gitStatus === 'untracked' || entry.gitStatus === 'added';
  const isGitDeleted = entry.gitStatus === 'deleted';

  let nameColorClass = isSelected ? 'text-violet-400' : 'text-foreground';
  if (!isSelected) {
    if (isGitModified) nameColorClass = 'text-amber-500/90 dark:text-amber-400/90';
    else if (isGitAddedOrUntracked) nameColorClass = 'text-green-500/90 dark:text-green-400/90';
    else if (isGitDeleted) nameColorClass = 'text-red-500/90 dark:text-red-400/90 line-through';
  }

  return (
    <div className={`select-none group ${animClass}`}>
      <button
        type="button"
        onClick={handleClick}
        className={`${TREE_NODE_BASE} ${isSelected ? TREE_NODE_SELECTED : 'text-foreground hover:bg-muted/50 focus:bg-violet-500/5'}`}
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
      >
        <span className="w-3 flex shrink-0 items-center justify-center text-foreground/70 dark:text-muted-foreground" aria-hidden>
          {isDir && hasChildren ? (
            isExpanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )
          ) : (
            <span className="w-3" />
          )}
        </span>
        {isDir ? (
          isExpanded ? (
            <FolderOpen className="size-3.5 shrink-0 text-violet-400" aria-hidden />
          ) : (
            <Folder className="size-3.5 shrink-0 text-violet-400" aria-hidden />
          )
        ) : (
          <FileIcon pathOrName={entry.name} />
        )}
        <span className={`min-w-0 flex-1 truncate ${nameColorClass}`}>{entry.name}</span>
        
        {/* Badges container */}
        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {entry.gitStatus && (
            <span
              className={`text-[9px] font-bold tracking-wider ${
                isGitModified ? 'text-amber-500 dark:text-amber-400' :
                isGitAddedOrUntracked ? 'text-green-500 dark:text-green-400' :
                isGitDeleted ? 'text-red-500 dark:text-red-400' :
                'text-muted-foreground'
              }`}
              title={t('fileEditor.gitStatus', { status: entry.gitStatus })}
            >
              {isGitModified ? 'M' : isGitAddedOrUntracked ? 'U' : isGitDeleted ? 'D' : ''}
            </span>
          )}
          {isDirty && (
            <span
              className="size-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse"
              title={t('fileEditor.unsaved')}
            />
          )}
        </div>
      </button>
    </div>
  );
});
