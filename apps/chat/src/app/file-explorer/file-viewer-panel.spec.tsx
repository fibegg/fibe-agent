import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { FileViewerPanel } from './file-viewer-panel';
import { apiRequest } from '../api-url';

vi.mock('../api-url', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('./prism-loader', () => ({
  highlightCodeElement: vi.fn(),
}));

describe('FileViewerPanel', () => {
  const mockEntry = { path: '/test/file.ts', name: 'file.ts', type: 'file' as const, size: 100, lastModified: Date.now() };
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
    // mock console.error to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    (apiRequest as Mock).mockImplementation(() => new Promise(() => undefined));
    render(<FileViewerPanel entry={mockEntry} onClose={mockOnClose} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.getByText('file.ts')).toBeTruthy();
  });

  it('fetches and displays file content successfully', async () => {
    const mockContent = 'const a = 1;';
    (apiRequest as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: mockContent }),
    });

    render(<FileViewerPanel entry={mockEntry} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading…')).toBeNull();
    });

    expect(screen.getByText(mockContent)).toBeTruthy();
    expect(screen.getByText(/1 lines/)).toBeTruthy();
  });

  it('handles 404 error correctly', async () => {
    (apiRequest as Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    render(<FileViewerPanel entry={mockEntry} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('File not found')).toBeTruthy();
    });
  });

  it('handles general fetch error correctly', async () => {
    (apiRequest as Mock).mockRejectedValue(new Error('Network Error'));

    render(<FileViewerPanel entry={mockEntry} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Network Error')).toBeTruthy();
    });
  });

  it('copies content to clipboard', async () => {
    const mockContent = 'test copy content';
    (apiRequest as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: mockContent }),
    });

    render(<FileViewerPanel entry={mockEntry} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading…')).toBeNull();
    });

    const copyButton = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockContent);
  });

  it('calls onClose when close button is clicked', async () => {
    (apiRequest as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'content' }),
    });

    render(<FileViewerPanel entry={mockEntry} onClose={mockOnClose} />);
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('downloads the file content', async () => {
    const mockContent = 'test text';
    (apiRequest as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: mockContent }),
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    render(<FileViewerPanel entry={mockEntry} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading…')).toBeNull();
    });

    const downloadButton = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadButton);

    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
