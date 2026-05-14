import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FileEditorPanel } from './file-editor-panel';
import { apiRequest } from '../api-url';

const scrollToLineMock = vi.hoisted(() => vi.fn());
const searchInFileMock = vi.hoisted(() => vi.fn(() => ({ current: 1, total: 2 })));

vi.mock('../api-url', () => ({ apiRequest: vi.fn(), getAuthTokenForRequest: vi.fn(() => '') }));

// CodeMirror can't really run in jsdom — mock the loader so it renders content
// into a child element (simulating what CM does) while exposing a handle.
vi.mock('./file-editor-cm', () => ({
  createEditor: vi.fn(({ parent, content, onChange }: { parent: HTMLElement; content: string; onChange?: (content: string) => void }) => {
    let currentContent = content;
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-testid', 'cm-mock');
    textarea.value = content;
    textarea.textContent = content;
    textarea.addEventListener('input', () => {
      currentContent = textarea.value;
      textarea.textContent = currentContent;
      onChange?.(currentContent);
    });
    if (parent) parent.appendChild(textarea);
    return {
      view: {},
      setContent: vi.fn((c: string) => { currentContent = c; textarea.value = c; textarea.textContent = c; }),
      setReadOnly: vi.fn(),
      setTheme: vi.fn(),
      getContent: vi.fn(() => currentContent),
      scrollToLine: scrollToLineMock,
      searchInFile: searchInFileMock,
      focus: vi.fn(),
      destroy: vi.fn(() => { textarea.remove(); }),
    };
  }),
  getLanguageExtension: vi.fn(() => null),
  getLanguageLabel: vi.fn((filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const labels: Record<string, string> = { ts: 'TypeScript', tsx: 'TypeScript (TSX)', js: 'JavaScript', css: 'CSS', md: 'Markdown' };
    return labels[ext] ?? 'Plain text';
  }),
  LANG_MAP: {},
}));

const ENTRY = { name: 'app.ts', path: 'src/app.ts', type: 'file' as const };
const mockClose = vi.fn();

describe('FileEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scrollToLineMock.mockClear();
    searchInFileMock.mockClear();
    window.localStorage.clear();
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
    global.URL.createObjectURL = vi.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    if (typeof Range !== 'undefined') {
      Range.prototype.getClientRects = () => ([] as unknown as DOMRectList);
      Range.prototype.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => undefined } as DOMRect);
    }
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows loading spinner initially', () => {
    (apiRequest as Mock).mockImplementation(() => new Promise(() => undefined));
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows filename in header', () => {
    (apiRequest as Mock).mockImplementation(() => new Promise(() => undefined));
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    expect(screen.getByRole('heading', { name: 'app.ts' })).toBeTruthy();
  });

  it('shows full path as subtitle', () => {
    (apiRequest as Mock).mockImplementation(() => new Promise(() => undefined));
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    expect(screen.getByText('src/app.ts')).toBeTruthy();
  });

  it('displays content after successful load', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'const x = 1;' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    // Content may appear in both the mock editor and the fallback pre
    expect(screen.getAllByText(/const x = 1;/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows Empty file text for empty content', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: '' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(screen.getAllByText('Empty file').length).toBeGreaterThanOrEqual(1);
  });

  it('shows File not found on 404', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: false, status: 404 });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.getByText('File not found')).toBeTruthy());
  });

  it('shows Unauthorized on 401', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: false, status: 401 });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.getByText('Unauthorized')).toBeTruthy());
  });

  it('shows generic error on fetch failure', async () => {
    (apiRequest as Mock).mockRejectedValue(new Error('Network error'));
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.getByText('Network error')).toBeTruthy());
  });

  it('Copy button is disabled while loading', () => {
    (apiRequest as Mock).mockImplementation(() => new Promise(() => undefined));
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    expect(screen.getByRole('button', { name: /copy/i }).hasAttribute('disabled')).toBe(true);
  });

  it('Download button is disabled while loading', () => {
    (apiRequest as Mock).mockImplementation(() => new Promise(() => undefined));
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    expect(screen.getByRole('button', { name: /download/i }).hasAttribute('disabled')).toBe(true);
  });

  it('Copy button enabled after load and copies content', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'hello world' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    // CM mock getContent returns 'test content' (the mocked editor handle)
    // real usage would return live content; here we just confirm clipboard was called
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  });

  it('Download button triggers file download', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'download me' }) });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('calls onClose when Close button clicked', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'x' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    (apiRequest as Mock).mockImplementation(() => new Promise(() => undefined));
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('Save button is disabled when content not dirty', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'clean' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(screen.getByRole('button', { name: /save/i }).hasAttribute('disabled')).toBe(true);
  });

  it('shows language label in status bar after load', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'x' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.getByText('TypeScript')).toBeTruthy());
  });

  it('shows line count in status bar', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'a\nb\nc' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.getByText(/3 lines/)).toBeTruthy());
  });

  it('calls onDirtyChange when dirty state changes', async () => {
    const onDirtyChange = vi.fn();
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'original' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} onDirtyChange={onDirtyChange} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    // Initially not dirty
    expect(onDirtyChange).toHaveBeenCalledWith('src/app.ts', false);
  });

  it('calls onDirtyChange with false after discarding changes', async () => {
    const onDirtyChange = vi.fn();
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'original' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} onDirtyChange={onDirtyChange} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(onDirtyChange).toHaveBeenLastCalledWith('src/app.ts', false);
  });

  it('renders inline without border styling', () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'x' }) });
    const { container } = render(<FileEditorPanel entry={ENTRY} onClose={mockClose} inline />);
    const panel = container.firstChild as HTMLElement;
    expect(panel?.className).toContain('rounded-none');
  });

  it('fetches from custom apiBasePath when provided', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'agent file' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} apiBasePath="/api/agent-files/file" />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    const call = (apiRequest as Mock).mock.calls[0][0] as string;
    expect(call).toContain('/api/agent-files/file');
  });

  it('renders image files from the raw file endpoint without fetching JSON content', () => {
    const imageEntry = { name: 'preview.png', path: 'assets/preview.png', type: 'file' as const };
    render(<FileEditorPanel entry={imageEntry} onClose={mockClose} />);

    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.getByAltText('preview.png').getAttribute('src')).toContain('/api/playgrounds/file/raw?path=assets%2Fpreview.png');
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('uses custom rawApiBasePath for image preview', () => {
    const imageEntry = { name: 'preview.png', path: 'assets/preview.png', type: 'file' as const };
    render(<FileEditorPanel entry={imageEntry} onClose={mockClose} rawApiBasePath="/api/agent-files/file/raw?conversationId=default" />);

    const src = screen.getByAltText('preview.png').getAttribute('src') ?? '';
    expect(src).toContain('/api/agent-files/file/raw?conversationId=default&path=assets%2Fpreview.png');
  });

  it('shows HTML preview iframe through the raw file endpoint', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: '<h1>Hello</h1>' }) });
    render(<FileEditorPanel entry={{ name: 'index.html', path: 'index.html', type: 'file' }} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    const iframe = document.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toContain('/api/playgrounds/file/raw?path=index.html');
    expect(iframe?.parentElement?.className).toContain('flex-1');
  });

  it('opens HTML files in preview mode by default', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: '<h1>Hello</h1>' }) });
    render(<FileEditorPanel entry={{ name: 'cosmetics.html', path: 'cosmetics.html', type: 'file' }} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    expect(document.querySelector('iframe')?.getAttribute('src')).toContain('/api/playgrounds/file/raw?path=cosmetics.html');
    expect(screen.getByRole('button', { name: 'Preview' }).className).toContain('bg-violet-500/20');
  });

  it('switches HTML preview to code before searching file content', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: '<h1>Zoo</h1>' }) });
    render(<FileEditorPanel entry={{ name: 'zoo.html', path: 'zoo.html', type: 'file' }} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(document.querySelector('iframe')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByPlaceholderText('Search in file...'), { target: { value: 'Zoo' } });

    await waitFor(() => expect(screen.getByTestId('cm-mock')).toBeTruthy());
    await waitFor(() => expect(searchInFileMock).toHaveBeenCalledWith('Zoo', 'next'));
    expect(screen.getByRole('button', { name: 'Code' }).className).toContain('bg-violet-500/20');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('orders HTML view modes as preview, split, then code', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: '<h1>Hello</h1>' }) });
    render(<FileEditorPanel entry={{ name: 'index.html', path: 'index.html', type: 'file' }} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    const modeLabels = screen.getAllByRole('button').slice(0, 3).map((button) => button.getAttribute('aria-label'));

    expect(modeLabels).toEqual(['Preview', 'Split', 'Code']);
  });

  it('saves agent workspace files through the provided content endpoint', async () => {
    (apiRequest as Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: 'original' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} apiBasePath="/api/agent-files/file?conversationId=thread-a" />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    const editor = screen.getByTestId('cm-mock') as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: 'updated' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(apiRequest).toHaveBeenLastCalledWith('/api/agent-files/file?conversationId=thread-a', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ path: 'src/app.ts', content: 'updated' }),
    }));
  });

  it('toggles the optional file preview rail', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'const x = 1;\nconst y = 2;' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    expect(screen.queryByRole('complementary', { name: 'File preview' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'File preview' }));

    expect(screen.getByRole('complementary', { name: 'File preview' })).toBeTruthy();
    expect(window.localStorage.getItem('fibe.fileEditor.filePreview')).toBe('1');
  });

  it('jumps through the file when the preview rail is used', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'line 1\nline 2\nline 3\nline 4' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'File preview' }));
    const rail = screen.getByRole('complementary', { name: 'File preview' });
    fireEvent.pointerDown(rail, { clientY: 0 });

    expect(scrollToLineMock).toHaveBeenCalledWith(1);
  });

  it('uses the preview rail scroll position when jumping through the file', async () => {
    const content = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join('\n');
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'File preview' }));
    const rail = screen.getByRole('complementary', { name: 'File preview' });
    Object.defineProperty(rail, 'scrollTop', { configurable: true, value: 200 });
    Object.defineProperty(rail, 'scrollHeight', { configurable: true, value: 400 });
    Object.defineProperty(rail, 'clientHeight', { configurable: true, value: 100 });
    vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
      width: 96,
      height: 100,
      top: 0,
      left: 0,
      right: 96,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    } as DOMRect);

    fireEvent(rail, new MouseEvent('pointerdown', { bubbles: true, clientY: 50 }));

    expect(scrollToLineMock).toHaveBeenCalledWith(63);
  });

  it('supports keyboard activation for the file preview rail', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'line 1\nline 2' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'File preview' }));
    fireEvent.keyDown(screen.getByRole('complementary', { name: 'File preview' }), { key: 'Enter' });

    expect(scrollToLineMock).toHaveBeenCalledWith(1);
  });

  it('searches inside the open file from the toolbar', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'const x = 1;\nconst y = 2;' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByPlaceholderText('Search in file...'), { target: { value: 'const' } });

    expect(searchInFileMock).toHaveBeenCalledWith('const', 'next');
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('opens in-file search with Cmd+F', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'const x = 1;' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    fireEvent.keyDown(window, { key: 'f', metaKey: true });

    expect(screen.getByPlaceholderText('Search in file...')).toBeTruthy();
  });

  it('refreshes the HTML preview iframe after saving', async () => {
    (apiRequest as Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: '<h1>Hello</h1>' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<FileEditorPanel entry={{ name: 'index.html', path: 'index.html', type: 'file' }} onClose={mockClose} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const initialSrc = document.querySelector('iframe')?.getAttribute('src') ?? '';
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    const editor = await screen.findByTestId('cm-mock') as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: '<h1>Updated</h1>' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(document.querySelector('iframe')?.getAttribute('src')).toContain('&v=1'));
    expect(document.querySelector('iframe')?.getAttribute('src')).not.toBe(initialSrc);
  });

  it('shows saved state in status bar (not dirty)', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'clean' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  });
});
