import { describe, it, expect, beforeEach } from 'vitest';
import { renderMarkdown, clearMarkdownCache, getMarkdownCacheSize } from './markdown-cache';

describe('markdown-cache', () => {
  beforeEach(() => clearMarkdownCache());

  it('returns same result for same input', () => {
    const text = '**hello**';
    expect(renderMarkdown(text)).toBe(renderMarkdown(text));
  });

  it('returns different result for different input', () => {
    const a = renderMarkdown('**a**');
    const b = renderMarkdown('**b**');
    expect(a).not.toBe(b);
  });

  it('renders markdown to html', () => {
    const html = renderMarkdown('**bold**');
    expect(html).toContain('<strong>');
    expect(html).toContain('bold');
  });

  it('evicts oldest entries when over max size', () => {
    for (let i = 0; i < 250; i++) renderMarkdown(`text-${i}`);
    expect(getMarkdownCacheSize()).toBeLessThanOrEqual(200);
  });
});
