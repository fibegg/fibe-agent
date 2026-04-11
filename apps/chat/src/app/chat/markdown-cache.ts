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

const DANGEROUS_TAG_RE = /<\s*\/?\s*(script|iframe|object|embed|form|input|textarea|button|select|style|link|meta|base)\b[^>]*>/gi;
const EVENT_HANDLER_RE = /\s+on\w+\s*=\s*["'][^"']*["']/gi;

function sanitizeHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAG_RE, '')
    .replace(EVENT_HANDLER_RE, '');
}

interface CacheEntry {
  html: string;
  sourceText: string;
}

const cache = new Map<string, CacheEntry>();

function evictOldest(): void {
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) cache.delete(firstKey);
}

export function renderMarkdown(text: string, cacheKey?: string): string {
  const key = cacheKey ?? text;
  const existing = cache.get(key);
  
  if (existing && existing.sourceText === text) {
    return existing.html;
  }
  
  try {
    const out = marked.parse(text);
    const html = typeof out === 'string' ? sanitizeHtml(out) : escapeHtml(text);
    if (!cache.has(key) && cache.size >= MAX_CACHE_SIZE) evictOldest();
    cache.set(key, { html, sourceText: text });
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
