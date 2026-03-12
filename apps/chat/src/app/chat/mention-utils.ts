export const AT_MENTION_REGEX = /(@[^\s@]+)/g;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.sass', '.html']);
const DOC_EXT = new Set(['.md', '.mdx', '.txt']);

const FILE_EXT_REGEX = /\.(md|tsx?|jsx?|json|css|scss|sass|html|yml|yaml|txt|svg)$/i;

export type FileIconType = 'folder' | 'image' | 'code' | 'doc' | 'file';

function lastSegment(path: string): string {
  return path.split('/').pop() ?? '';
}

export function isLikelyFile(path: string): boolean {
  const segment = lastSegment(path);
  return segment.includes('.') && FILE_EXT_REGEX.test(segment);
}

export function pathDisplayName(path: string): string {
  const segment = lastSegment(path);
  return segment || path;
}

export function getFileIconType(path: string): { type: FileIconType; colorClass: string } {
  const name = lastSegment(path);
  if (!name.includes('.')) {
    return { type: 'folder', colorClass: 'text-violet-600 dark:text-violet-400' };
  }
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (IMAGE_EXT.has(ext)) return { type: 'image', colorClass: 'text-pink-400' };
  if (CODE_EXT.has(ext)) return { type: 'code', colorClass: 'text-green-400' };
  if (DOC_EXT.has(ext)) return { type: 'doc', colorClass: 'text-blue-400' };
  return { type: 'file', colorClass: 'text-muted-foreground' };
}
