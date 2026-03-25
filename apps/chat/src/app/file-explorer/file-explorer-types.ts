export interface PlaygroundEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  mtime?: number;
  children?: PlaygroundEntry[];
  gitStatus?: 'modified' | 'untracked' | 'deleted' | 'added' | 'renamed';
}
