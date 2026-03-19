import { describe, it, expect } from 'vitest';
import { readDomFromEl, segmentsToStr } from './contenteditable-serialize';

describe('readDomFromEl', () => {
  it('joins sibling block divs with newlines', () => {
    const root = document.createElement('div');
    const a = document.createElement('div');
    a.textContent = '```ts';
    const b = document.createElement('div');
    b.textContent = 'const x = 1;';
    root.appendChild(a);
    root.appendChild(b);
    expect(segmentsToStr(readDomFromEl(root))).toBe('```ts\nconst x = 1;');
  });

  it('preserves a blank line between block divs', () => {
    const root = document.createElement('div');
    const a = document.createElement('div');
    a.textContent = 'a';
    const empty = document.createElement('div');
    const b = document.createElement('div');
    b.textContent = 'b';
    root.appendChild(a);
    root.appendChild(empty);
    root.appendChild(b);
    expect(segmentsToStr(readDomFromEl(root))).toBe('a\n\nb');
  });

  it('reads br inside a block as newline', () => {
    const root = document.createElement('div');
    const inner = document.createElement('div');
    inner.appendChild(document.createTextNode('line1'));
    inner.appendChild(document.createElement('br'));
    inner.appendChild(document.createTextNode('line2'));
    root.appendChild(inner);
    expect(segmentsToStr(readDomFromEl(root))).toBe('line1\nline2');
  });

  it('merges a text node followed by a block div with a newline', () => {
    const root = document.createElement('div');
    root.appendChild(document.createTextNode('```ts'));
    const block = document.createElement('div');
    block.textContent = 'import x';
    root.appendChild(block);
    expect(segmentsToStr(readDomFromEl(root))).toBe('```ts\nimport x');
  });
});
