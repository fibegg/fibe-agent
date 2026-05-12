import type { PlaygroundEntry } from './file-explorer-types';
import { FileEditorPanel, FileEditorDialog } from './file-editor-panel';

export function FileViewerPanel({
  entry,
  onClose,
  inline = false,
  apiBasePath,
  rawApiBasePath,
  onDirtyChange,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
  inline?: boolean;
  apiBasePath?: string;
  rawApiBasePath?: string;
  onDirtyChange?: (path: string, isDirty: boolean) => void;
}) {
  return (
    <FileEditorPanel
      entry={entry}
      onClose={onClose}
      inline={inline}
      apiBasePath={apiBasePath}
      rawApiBasePath={rawApiBasePath}
      onDirtyChange={onDirtyChange}
    />
  );
}

export function FileDetailsDialog({
  entry,
  onClose,
  apiBasePath,
  rawApiBasePath,
  onDirtyChange,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
  apiBasePath?: string;
  rawApiBasePath?: string;
  onDirtyChange?: (path: string, isDirty: boolean) => void;
}) {
  return (
    <FileEditorDialog
      entry={entry}
      onClose={onClose}
      apiBasePath={apiBasePath}
      rawApiBasePath={rawApiBasePath}
      onDirtyChange={onDirtyChange}
    />
  );
}
