export const AT_MENTION_REGEX = /(@[^\s@]+)/g;

const FILE_EXT_REGEX = /\.(md|mdx|tsx?|jsx?|json|json5|jsonc|css|scss|sass|less|html|htm|yml|yaml|txt|svg|png|jpg|jpeg|gif|webp|ico|py|rb|go|rs|java|kt|swift|c|cpp|h|hpp|cs|php|sql|xml|csv|toml|ini|sh|bash|zsh)$/i;

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
