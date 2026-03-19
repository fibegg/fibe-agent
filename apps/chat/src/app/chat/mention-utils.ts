const MENTION_AFTER_START_OR_WHITESPACE = /(?:^|\s)(@[^\s@]+)/g;

/** Single-segment @tokens that are language directives, not playground paths. */
const CODE_AT_SINGLE_SEGMENT = new Set(
  [
    'media',
    'import',
    'keyframes',
    'supports',
    'charset',
    'layer',
    'container',
    'property',
    'namespace',
    'page',
    'font-face',
    'document',
    'viewport',
    'use',
    'forward',
    'extend',
    'mixin',
    'include',
    'apply',
    'tailwind',
    'theme',
    'function',
    'return',
    'for',
    'each',
    'while',
    'debug',
    'warn',
    'error',
    'at-root',
    'custom-media',
    'scope',
    'starting-style',
  ].map((s) => s.toLowerCase())
);

const REASONABLE_PATH_TOKEN = /^[\w.-]+$/;

export type MessageBodyPart =
  | { type: 'text'; content: string }
  | { type: 'mention'; path: string };

/**
 * File mentions use @path/to/file, @name.ext, or a single path-like segment (@src).
 * Tokens like @media (CSS), @Component (decorators), @import are left as plain text.
 */
export function isPlausibleFileMentionPath(path: string): boolean {
  if (!path) return false;
  if (path.includes('/')) return true;
  if (isLikelyFile(path)) return true;
  const seg = lastSegment(path);
  if (CODE_AT_SINGLE_SEGMENT.has(seg.toLowerCase())) return false;
  if (/^[A-Z]/.test(path)) return false;
  return REASONABLE_PATH_TOKEN.test(path);
}

export function parseMessageBodyParts(body: string): MessageBodyPart[] {
  const parts: MessageBodyPart[] = [];
  let lastEnd = 0;
  let match;
  MENTION_AFTER_START_OR_WHITESPACE.lastIndex = 0;
  while ((match = MENTION_AFTER_START_OR_WHITESPACE.exec(body)) !== null) {
    const fullMatch = match[0];
    const path = match[1].slice(1);
    if (!isPlausibleFileMentionPath(path)) {
      parts.push({ type: 'text', content: body.slice(lastEnd, match.index + fullMatch.length) });
      lastEnd = match.index + fullMatch.length;
      continue;
    }
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
  return mergeAdjacentTextParts(parts.length ? parts : [{ type: 'text', content: body }]);
}

function mergeAdjacentTextParts(parts: MessageBodyPart[]): MessageBodyPart[] {
  const out: MessageBodyPart[] = [];
  for (const p of parts) {
    if (p.type === 'text' && out.length > 0 && out[out.length - 1]!.type === 'text') {
      (out[out.length - 1] as { type: 'text'; content: string }).content += p.content;
    } else {
      out.push(p);
    }
  }
  return out;
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
