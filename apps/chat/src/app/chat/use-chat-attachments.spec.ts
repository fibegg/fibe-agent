import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  getClipboardTextForContentEditablePaste,
  hasNonEmptyPlainTextOnClipboard,
  useChatAttachments,
  MAX_PENDING_TOTAL,
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

describe('useChatAttachments', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with empty state', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    expect(result.current.pendingImages).toEqual([]);
    expect(result.current.pendingAttachments).toEqual([]);
    expect(result.current.pendingVoice).toBeNull();
    expect(result.current.isDragOver).toBe(false);
  });

  it('addImage adds a data URL to pendingImages', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    act(() => { result.current.addImage('data:image/png;base64,abc'); });
    expect(result.current.pendingImages).toEqual(['data:image/png;base64,abc']);
  });

  it('removePendingImage removes by index', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    act(() => {
      result.current.addImage('img1');
      result.current.addImage('img2');
    });
    act(() => { result.current.removePendingImage(0); });
    expect(result.current.pendingImages).toEqual(['img2']);
  });

  it('addAttachment adds an attachment entry', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    act(() => { result.current.addAttachment('file.txt', 'My File'); });
    expect(result.current.pendingAttachments).toEqual([{ filename: 'file.txt', name: 'My File' }]);
  });

  it('removePendingAttachment removes by index', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    act(() => {
      result.current.addAttachment('a.txt', 'A');
      result.current.addAttachment('b.txt', 'B');
    });
    act(() => { result.current.removePendingAttachment(1); });
    expect(result.current.pendingAttachments).toEqual([{ filename: 'a.txt', name: 'A' }]);
  });

  it('clearPending resets all state', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    act(() => {
      result.current.addImage('img1');
      result.current.addAttachment('a.txt', 'A');
    });
    act(() => { result.current.clearPending(); });
    expect(result.current.pendingImages).toEqual([]);
    expect(result.current.pendingAttachments).toEqual([]);
  });

  it('removePendingVoice clears voice state', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    act(() => {
      result.current.setPendingVoice('voice_data');
      result.current.setPendingVoiceFilename('voice.wav');
    });
    act(() => { result.current.removePendingVoice(); });
    expect(result.current.pendingVoice).toBeNull();
    expect(result.current.pendingVoiceFilename).toBeNull();
  });

  it('MAX_PENDING_TOTAL is exported correctly', () => {
    expect(MAX_PENDING_TOTAL).toBe(10);
  });

  it('handleDragOver sets dropEffect to copy', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { dropEffect: '' },
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDragOver(event); });
    expect(event.dataTransfer.dropEffect).toBe('copy');
  });

  it('handleDragEnter sets isDragOver when authenticated and has room', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { types: ['Files'] },
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDragEnter(event); });
    expect(result.current.isDragOver).toBe(true);
  });

  it('handleDragEnter does not set isDragOver when not authenticated', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: false }));
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { types: ['Files'] },
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDragEnter(event); });
    expect(result.current.isDragOver).toBe(false);
  });

  it('handleDragLeave hides overlay when counter hits 0', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    const enterEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { types: ['Files'] },
    } as unknown as React.DragEvent;
    const leaveEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDragEnter(enterEvent); });
    expect(result.current.isDragOver).toBe(true);
    act(() => { result.current.handleDragLeave(leaveEvent); });
    expect(result.current.isDragOver).toBe(false);
  });

  it('handleDrop resets isDragOver', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { files: [] as unknown as FileList },
    } as unknown as React.DragEvent;
    act(() => { result.current.handleDrop(dropEvent); });
    expect(result.current.isDragOver).toBe(false);
  });

  it('handlePaste ignores event when clipboard has text', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    const event = {
      clipboardData: {
        getData: (t: string) => (t === 'text/plain' ? 'some text' : ''),
        items: [],
      },
    } as unknown as React.ClipboardEvent;
    act(() => { result.current.handlePaste(event); });
    expect(result.current.pendingImages).toEqual([]);
  });

  it('handleDrop calls addFiles with dropped files', async () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));

    // Stub FileReader as a class constructor
    class FakeFileReader {
      result = 'data:image/png;base64,abc';
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        queueMicrotask(() => this.onload?.({} as ProgressEvent<FileReader>));
      }
    }
    vi.stubGlobal('FileReader', FakeFileReader);

    const file = new File(['pixel'], 'photo.png', { type: 'image/png' });
    const mockFileList = { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList;

    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { files: mockFileList },
    } as unknown as React.DragEvent;

    await act(async () => {
      result.current.handleDrop(dropEvent);
      await new Promise((resolve) => queueMicrotask(resolve as () => void));
    });

    expect(result.current.pendingImages.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('handlePaste reads image from clipboard items', async () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));

    class FakeFileReader {
      result = 'data:image/png;base64,xyz';
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        queueMicrotask(() => this.onload?.({} as ProgressEvent<FileReader>));
      }
    }
    vi.stubGlobal('FileReader', FakeFileReader);

    const fakeFile = new File(['pixel'], 'image.png', { type: 'image/png' });
    const pasteEvent = {
      clipboardData: {
        getData: () => '',
        items: [{ type: 'image/png', getAsFile: () => fakeFile }],
      },
    } as unknown as React.ClipboardEvent;

    await act(async () => {
      result.current.handlePaste(pasteEvent);
      await new Promise((resolve) => queueMicrotask(resolve as () => void));
    });

    expect(result.current.pendingImages.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('handlePaste skips when item.getAsFile() returns null', () => {
    const { result } = renderHook(() => useChatAttachments({ isAuthenticated: true }));
    const pasteEvent = {
      clipboardData: {
        getData: () => '',
        items: [{ type: 'image/jpeg', getAsFile: () => null }],
      },
    } as unknown as React.ClipboardEvent;
    act(() => { result.current.handlePaste(pasteEvent); });
    expect(result.current.pendingImages).toEqual([]);
  });
});

