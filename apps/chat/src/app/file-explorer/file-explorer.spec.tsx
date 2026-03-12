import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('shows playground/ label when tree is loaded', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [] as PlaygroundEntry[],
    });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/No files in playground\//)).toBeTruthy();
    });
    expect(screen.getByText(/playground\//)).toBeTruthy();
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

  it('shows single top-level directory name as label when tree has one dir', async () => {
    const tree: PlaygroundEntry[] = [
      {
        name: 'zcss',
        path: 'zcss',
        type: 'directory',
        children: [{ name: 'build.zig', path: 'zcss/build.zig', type: 'file' }],
      },
    ];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => tree,
    });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('zcss/')).toBeTruthy();
    });
    expect(screen.getByText('zcss')).toBeTruthy();
  });

  it('shows Phoenix version in sidebar', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [] as PlaygroundEntry[],
    });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/Phoenix v/)).toBeTruthy();
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

  it('expands and collapses directory when folder is clicked', async () => {
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
    await waitFor(() => {
      expect(screen.getByText('util.ts')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('lib'));
    await waitFor(() => {
      expect(screen.queryByText('util.ts')).toBeNull();
    });
    fireEvent.click(screen.getByText('lib'));
    await waitFor(() => {
      expect(screen.getByText('util.ts')).toBeTruthy();
    });
  });

  it('opens file viewer dialog when file is clicked', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'readme.md', path: 'readme.md', type: 'file' },
    ];
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: '# Hello' }),
      });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('readme.md')).toBeTruthy();
    });
    expect(screen.queryByRole('heading', { name: 'File viewer' })).toBeNull();
    fireEvent.click(screen.getByText('readme.md'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'File viewer' })).toBeTruthy();
    });
    expect(screen.getAllByText('readme.md').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onSettingsClick when Settings button is clicked', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [] as PlaygroundEntry[],
    });
    const onSettingsClick = vi.fn();
    render(<FileExplorer onSettingsClick={onSettingsClick} />);
    await waitFor(() => {
      expect(screen.getByText(/playground\//)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
  });

  it('does not throw when Settings is clicked without onSettingsClick', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [] as PlaygroundEntry[],
    });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/playground\//)).toBeTruthy();
    });
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Settings' }))).not.toThrow();
  });

  it('renders collapsed rail when collapsed is true', () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<Response>(() => undefined)
    );
    render(<FileExplorer collapsed />);
    expect(screen.queryByPlaceholderText('Search files...')).toBeNull();
    expect(screen.queryByText(/Expand Level/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('renders full explorer when collapsed is false', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [] as PlaygroundEntry[],
    });
    render(<FileExplorer collapsed={false} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search files...')).toBeTruthy();
    });
    expect(screen.getByText(/playground\//)).toBeTruthy();
  });

  it('shows Settings in collapsed rail and calls onSettingsClick when clicked', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [] as PlaygroundEntry[],
    });
    const onSettingsClick = vi.fn();
    render(<FileExplorer collapsed onSettingsClick={onSettingsClick} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
  });

  it('shows file content in viewer after file is loaded', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'app.js', path: 'app.js', type: 'file' },
    ];
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: 'const x = 1;' }),
      });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('app.js')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('app.js'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'File viewer' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/const x = 1;/)).toBeTruthy();
    });
  });

  it('shows language label for known file extension in file viewer', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'readme.md', path: 'readme.md', type: 'file' },
    ];
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: '# Hi' }),
      });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('readme.md')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('readme.md'));
    await waitFor(() => {
      expect(screen.getByText('markdown')).toBeTruthy();
    });
  });

  it('shows zig language label for .zig file in file viewer', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'build.zig', path: 'build.zig', type: 'file' },
    ];
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: 'const std = @import("std");' }),
      });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('build.zig')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('build.zig'));
    await waitFor(() => {
      expect(screen.getByText('zig')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/@import/)).toBeTruthy();
    });
  });

  it('shows Plain text for unknown file extension in file viewer', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'file.xyz', path: 'file.xyz', type: 'file' },
    ];
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: 'unknown format content' }),
      });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('file.xyz')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('file.xyz'));
    await waitFor(() => {
      expect(screen.getByText('Plain text')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/unknown format content/)).toBeTruthy();
    });
  });

  it('shows Empty file when file content is empty', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'empty.txt', path: 'empty.txt', type: 'file' },
    ];
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: '' }),
      });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('empty.txt')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('empty.txt'));
    await waitFor(() => {
      expect(screen.getByText('Empty file')).toBeTruthy();
    });
  });

  it('shows error message in file viewer when file fetch fails', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'bad.txt', path: 'bad.txt', type: 'file' },
    ];
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockRejectedValueOnce(new Error('Failed to load file'));
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('bad.txt')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('bad.txt'));
    await waitFor(() => {
      expect(screen.getByText('Failed to load file')).toBeTruthy();
    });
  });

  it('shows File not found when file content returns 404', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'missing.md', path: 'missing.md', type: 'file' },
    ];
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('missing.md')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('missing.md'));
    await waitFor(() => {
      expect(screen.getByText('File not found')).toBeTruthy();
    });
  });

  it('closes file viewer when Close button is clicked', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'f.js', path: 'f.js', type: 'file' },
    ];
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: 'x' }),
      });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('f.js')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('f.js'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'File viewer' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'File viewer' })).toBeNull();
    });
  });

  it('closes file viewer when Escape is pressed', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'a.js', path: 'a.js', type: 'file' },
    ];
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: 'x' }),
      });
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('a.js')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('a.js'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'File viewer' })).toBeTruthy();
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'File viewer' })).toBeNull();
    });
  });

  it('disables Copy and Download while file is loading', async () => {
    const tree: PlaygroundEntry[] = [
      { name: 'slow.js', path: 'slow.js', type: 'file' },
    ];
    let resolveFile: (value: { ok: boolean; status: number; json: () => Promise<{ content: string }> }) => void;
    const filePromise = new Promise<{ ok: boolean; status: number; json: () => Promise<{ content: string }> }>((resolve) => {
      resolveFile = resolve;
    });
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tree,
      })
      .mockReturnValueOnce(filePromise);
    render(<FileExplorer />);
    await waitFor(() => {
      expect(screen.getByText('slow.js')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('slow.js'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'File viewer' })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Copy' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Download' }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      const resolve = resolveFile as (v: { ok: boolean; status: number; json: () => Promise<{ content: string }> }) => void;
      resolve({
        ok: true,
        status: 200,
        json: async () => ({ content: 'done' }),
      });
    });
  });
});
