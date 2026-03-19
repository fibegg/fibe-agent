import { describe, it, expect } from 'vitest';
import {
  getClipboardTextForContentEditablePaste,
  hasNonEmptyPlainTextOnClipboard,
} from './use-chat-attachments';

function mockClipboard(getData: (type: string) => string) {
  return { getData } as unknown as ClipboardEvent['clipboardData'];
}

describe('getClipboardTextForContentEditablePaste', () => {
  it('returns null when clipboardData is null', () => {
    expect(getClipboardTextForContentEditablePaste(null)).toBe(null);
  });

  it('returns plain text when text/plain is non-empty', () => {
    const body = "const x = 1\n";
    expect(
      getClipboardTextForContentEditablePaste(mockClipboard((t) => (t === 'text/plain' ? body : '')))
    ).toBe(body);
  });

  it('returns null when text/plain is only whitespace and html is empty', () => {
    expect(
      getClipboardTextForContentEditablePaste(
        mockClipboard((t) => (t === 'text/plain' ? '  \n' : t === 'text/html' ? '' : ''))
      )
    ).toBe(null);
  });

  it('returns innerText when text/plain is empty but html has a pre block', () => {
    const html = '<html><body><pre>line1\nline2</pre></body></html>';
    expect(
      getClipboardTextForContentEditablePaste(
        mockClipboard((t) => (t === 'text/plain' ? '' : t === 'text/html' ? html : ''))
      )
    ).toBe('line1\nline2');
  });

  it('returns null when html is only an image', () => {
    const html = '<html><body><img src="data:image/png;base64,xx" /></body></html>';
    expect(
      getClipboardTextForContentEditablePaste(
        mockClipboard((t) => (t === 'text/plain' ? '' : t === 'text/html' ? html : ''))
      )
    ).toBe(null);
  });
});

describe('hasNonEmptyPlainTextOnClipboard', () => {
  it('returns false when clipboardData is null', () => {
    expect(hasNonEmptyPlainTextOnClipboard(null)).toBe(false);
  });

  it('returns true when text/plain has code from an IDE', () => {
    const body = "function x() {\n  return 1;\n}\n";
    expect(hasNonEmptyPlainTextOnClipboard(mockClipboard((t) => (t === 'text/plain' ? body : '')))).toBe(
      true
    );
  });

  it('returns true when only html provides text', () => {
    const html = '<pre>abc</pre>';
    expect(
      hasNonEmptyPlainTextOnClipboard(
        mockClipboard((t) => (t === 'text/plain' ? '' : t === 'text/html' ? html : ''))
      )
    ).toBe(true);
  });
});
