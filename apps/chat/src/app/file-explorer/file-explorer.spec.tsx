import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileExplorer, type PlaygroundEntry } from './file-explorer';

vi.mock('../api-url', () => ({
  getApiUrl: () => '',
  getAuthTokenForRequest: () => '',
}));

describe('FileExplorer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows playground/ label in header', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [] as PlaygroundEntry[],
    });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('playground/')).toBeTruthy();
    });
  });

  it('shows loading state initially', () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<Response>(() => undefined)
    );
    render(<FileExplorer />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows empty message when API returns empty array', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [] as PlaygroundEntry[],
    });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/No files in playground\//)).toBeTruthy();
    });
  });

  it('shows error when fetch fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  it('shows error when response is not ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load playgrounds')).toBeTruthy();
    });
  });

  it('renders file and directory entries from API', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'readme.md', path: 'readme.md', type: 'file' },
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [{ name: 'index.ts', path: 'src/index.ts', type: 'file' }],
      },
    ];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => tree,
    });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('readme.md')).toBeTruthy();
    });
    expect(screen.getByText('src')).toBeTruthy();
  });

  it('expands directory when folder is clicked', async () => {
    const tree: PlaygroundEntry[] = [
      {
        name: 'lib',
        path: 'lib',
        type: 'directory',
        children: [{ name: 'util.ts', path: 'lib/util.ts', type: 'file' }],
      },
    ];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => tree,
    });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('lib')).toBeTruthy();
    });
    expect(screen.queryByText('util.ts')).toBeNull();
    fireEvent.click(screen.getByText('lib'));
    await waitFor(() => {
      expect(screen.getByText('util.ts')).toBeTruthy();
    });
  });
});
