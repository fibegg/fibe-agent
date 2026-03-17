export const AT_MENTION_REGEX = /(@[^\s@]+)/g;

const MENTION_AFTER_START_OR_WHITESPACE = /(?:^|\s)(@[^\s@]+)/g;

export type MessageBodyPart =
  | { type: 'text'; content: string }
  | { type: 'mention'; path: string };

export function parseMessageBodyParts(body: string): MessageBodyPart[] {
  const parts: MessageBodyPart[] = [];
  let lastEnd = 0;
  let match;
  MENTION_AFTER_START_OR_WHITESPACE.lastIndex = 0;
  while ((match = MENTION_AFTER_START_OR_WHITESPACE.exec(body)) !== null) {
    const fullMatch = match[0];
    const path = match[1].slice(1);
    if (match.index > lastEnd) {
      const textEnd = /^\s/.test(fullMatch) ? match.index + 1 : match.index;
      parts.push({ type: 'text', content: body.slice(lastEnd, textEnd) });
    }
    parts.push({ type: 'mention', path });
    lastEnd = match.index + fullMatch.length;
  }
  if (lastEnd < body.length) {
    parts.push({ type: 'text', content: body.slice(lastEnd) });
  }
  return parts.length ? parts : [{ type: 'text', content: body }];
}

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
