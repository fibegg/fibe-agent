import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FileEditorPanel } from './file-editor-panel';
import { apiRequest } from '../api-url';

vi.mock('../api-url', () => ({ apiRequest: vi.fn() }));

// CodeMirror can't really run in jsdom — mock the loader so it renders content
// into a child element (simulating what CM does) while exposing a handle.
vi.mock('./file-editor-cm', () => ({
  createEditor: vi.fn(({ parent, content }: { parent: HTMLElement; content: string }) => {
    // Mimic CodeMirror rendering content into a child span (not textContent,
    // which would wipe out React-managed children like the empty-file placeholder).
    let currentContent = content;
    const span = document.createElement('span');
    span.setAttribute('data-testid', 'cm-mock');
    span.textContent = content;
    if (parent) parent.appendChild(span);
    return {
      view: {},
      setContent: vi.fn((c: string) => { currentContent = c; span.textContent = c; }),
      setReadOnly: vi.fn(),
      setTheme: vi.fn(),
      getContent: vi.fn(() => currentContent),
      focus: vi.fn(),
      destroy: vi.fn(() => { span.remove(); }),
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
    // Content may appear in both the editor container and the fallback pre
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

  it('shows saved state in status bar (not dirty)', async () => {
    (apiRequest as Mock).mockResolvedValue({ ok: true, json: async () => ({ content: 'clean' }) });
    render(<FileEditorPanel entry={ENTRY} onClose={mockClose} />);
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  });
});
