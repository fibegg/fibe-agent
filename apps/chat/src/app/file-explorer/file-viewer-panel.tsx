import type { PlaygroundEntry } from './file-explorer-types';
import { FileEditorPanel, FileEditorDialog } from './file-editor-panel';

export function FileViewerPanel({
  entry,
  onClose,
  inline = false,
  apiBasePath,
  onDirtyChange,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
  inline?: boolean;
  apiBasePath?: string;
  onDirtyChange?: (path: string, isDirty: boolean) => void;
}) {
  return (
    <FileEditorPanel
      entry={entry}
      onClose={onClose}
      inline={inline}
      apiBasePath={apiBasePath}
      onDirtyChange={onDirtyChange}
    />
  );
}

export function FileDetailsDialog({
  entry,
  onClose,
  apiBasePath,
  onDirtyChange,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
  apiBasePath?: string;
  onDirtyChange?: (path: string, isDirty: boolean) => void;
}) {
  return <FileEditorDialog entry={entry} onClose={onClose} apiBasePath={apiBasePath} onDirtyChange={onDirtyChange} />;
}
