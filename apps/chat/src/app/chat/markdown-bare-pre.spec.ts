import { describe, it, expect } from 'vitest';
import {
  normalizeBarePreElementsInContainer,
  stringHash32,
  wrapBarePreElementsInHtmlString,
} from './markdown-bare-pre';

describe('wrapBarePreElementsInHtmlString', () => {
  it('inserts a code.language-none wrapper for bare pre content', () => {
    const out = wrapBarePreElementsInHtmlString("<pre>x = 1</pre>");
    expect(out).toContain('<code class="language-none">');
  });

  it('preserves text inside bare pre when wrapping', () => {
    const out = wrapBarePreElementsInHtmlString("<pre>x = 1</pre>");
    expect(out).toContain('x = 1');
  });

  it('closes code before pre when wrapping bare pre', () => {
    const out = wrapBarePreElementsInHtmlString("<pre>x = 1</pre>");
    expect(out).toContain('</code></pre>');
  });

  it('leaves pre that already contains code unchanged', () => {
    const html = '<pre><code class="language-py">a</code></pre>';
    expect(wrapBarePreElementsInHtmlString(html)).toBe(html);
  });

  it('wraps every bare pre when multiple appear in one html string', () => {
    const out = wrapBarePreElementsInHtmlString('<pre>a</pre><p>x</p><pre>b</pre>');
    expect((out.match(/class="language-none"/g) ?? []).length).toBe(2);
  });
});

describe('normalizeBarePreElementsInContainer', () => {
  it('returns false when there is no pre element', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>x</p>';
    expect(normalizeBarePreElementsInContainer(div)).toBe(false);
  });

  it('returns true when a bare pre is normalized', () => {
    const div = document.createElement('div');
    div.innerHTML = '<pre>a</pre>';
    expect(normalizeBarePreElementsInContainer(div)).toBe(true);
  });

  it('moves pre text into a new code child', () => {
    const div = document.createElement('div');
    div.innerHTML = '<pre>hello</pre>';
    normalizeBarePreElementsInContainer(div);
    expect(div.querySelector('pre code')?.textContent).toBe('hello');
  });

  it('does not add a second code when pre already has code', () => {
    const div = document.createElement('div');
    div.innerHTML = '<pre><code class="language-py">z</code></pre>';
    expect(normalizeBarePreElementsInContainer(div)).toBe(false);
  });
});

describe('stringHash32', () => {
  it('is stable for the same string', () => {
    expect(stringHash32('same')).toBe(stringHash32('same'));
  });

  it('differs for different strings', () => {
    expect(stringHash32('alpha')).not.toBe(stringHash32('beta'));
  });
});
