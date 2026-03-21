export interface PlaygroundEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  mtime?: number;
  children?: PlaygroundEntry[];
}
