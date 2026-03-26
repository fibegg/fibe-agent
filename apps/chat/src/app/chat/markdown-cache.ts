import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

const MAX_CACHE_SIZE = 200;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const cache = new Map<string, string>();

function evictOldest(): void {
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) cache.delete(firstKey);
}

export function renderMarkdown(text: string): string {
  if (cache.has(text)) {
    return cache.get(text) ?? '';
  }
  try {
    const out = marked.parse(text);
    const html = typeof out === 'string' ? out : escapeHtml(text);
    if (cache.size >= MAX_CACHE_SIZE) evictOldest();
    cache.set(text, html);
    return html;
  } catch {
    return escapeHtml(text);
  }
}

export function clearMarkdownCache(): void {
  cache.clear();
}

export function getMarkdownCacheSize(): number {
  return cache.size;
}
