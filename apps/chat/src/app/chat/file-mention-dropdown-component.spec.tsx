import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileMentionDropdown } from './file-mention-dropdown';
import type { PlaygroundEntryItem } from './use-playground-files';

vi.mock('../file-icon', () => ({
  FileIcon: () => <span data-testid="file-icon" />,
}));

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

const entries: PlaygroundEntryItem[] = [
  { path: 'src/index.ts', name: 'index.ts', type: 'file' },
  { path: 'src/app.tsx', name: 'app.tsx', type: 'file' },
  { path: 'src/components', name: 'components', type: 'directory' },
  { path: 'README.md', name: 'README.md', type: 'file' },
  { path: 'package.json', name: 'package.json', type: 'file' },
  { path: 'tsconfig.json', name: 'tsconfig.json', type: 'file' },
  { path: 'vite.config.ts', name: 'vite.config.ts', type: 'file' },
  { path: 'jest.config.ts', name: 'jest.config.ts', type: 'file' },
  { path: 'extra.ts', name: 'extra.ts', type: 'file' }, // 9th entry — beyond MAX_VISIBLE=8
];

const anchorRef = { current: null } as React.RefObject<HTMLDivElement | null>;

describe('FileMentionDropdown', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not open', () => {
    const { container } = render(
      <FileMentionDropdown
        open={false}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders listbox when open', () => {
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('shows "No files or folders in playground" when entries is empty', () => {
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={[]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    expect(screen.getByText('No files or folders in playground')).toBeTruthy();
  });

  it('shows "No matching files or folders" when query matches nothing', () => {
    render(
      <FileMentionDropdown
        open={true}
        query="zzznomatch"
        entries={entries}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    expect(screen.getByText('No matching files or folders')).toBeTruthy();
  });

  it('filters entries by query', () => {
    render(
      <FileMentionDropdown
        open={true}
        query="index"
        entries={entries}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    expect(screen.getByText('index.ts')).toBeTruthy();
    expect(screen.queryByText('app.tsx')).toBeNull();
  });

  it('calls onSelect when an entry is clicked', () => {
    const onSelect = vi.fn();
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={onSelect}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    const options = screen.getAllByRole('option');
    fireEvent.click(options[0]);
    expect(onSelect).toHaveBeenCalledWith(entries[0].path);
  });

  it('shows "+ more" text when entries exceed MAX_VISIBLE (8)', () => {
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    expect(screen.getByText(/more — type to filter/)).toBeTruthy();
  });

  it('does not show "+ more" when entries fit within MAX_VISIBLE', () => {
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries.slice(0, 5)}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    expect(screen.queryByText(/more — type to filter/)).toBeNull();
  });

  it('highlights the first entry by default', () => {
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    const options = screen.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');
  });

  it('updates highlight on mouse enter', () => {
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    const options = screen.getAllByRole('option');
    fireEvent.mouseEnter(options[2]);
    expect(options[2].getAttribute('aria-selected')).toBe('true');
    expect(options[0].getAttribute('aria-selected')).toBe('false');
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={onClose}
        anchorRef={anchorRef}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves highlight down on ArrowDown', () => {
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(options[1].getAttribute('aria-selected')).toBe('true');
  });

  it('moves highlight up on ArrowUp', () => {
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    // Move down first
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    const options = screen.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  });

  it('selects highlighted entry on Enter', () => {
    const onSelect = vi.fn();
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={onSelect}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(entries[0].path);
  });

  it('ArrowDown does not go beyond last item', () => {
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries.slice(0, 2)}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(options[1].getAttribute('aria-selected')).toBe('true');
  });

  it('ArrowUp does not go below index 0', () => {
    render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    const options = screen.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  });

  it('does not respond to keyboard events when closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <FileMentionDropdown
        open={true}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={onClose}
        anchorRef={anchorRef}
      />
    );
    rerender(
      <FileMentionDropdown
        open={false}
        query=""
        entries={entries}
        onSelect={vi.fn()}
        onClose={onClose}
        anchorRef={anchorRef}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sorts results: name-starts-with matches first', () => {
    render(
      <FileMentionDropdown
        open={true}
        query="app"
        entries={[
          { path: 'src/myapp.ts', name: 'myapp.ts', type: 'file' },
          { path: 'app.tsx', name: 'app.tsx', type: 'file' },
        ]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />
    );
    const options = screen.getAllByRole('option');
    expect(options[0].textContent).toContain('app.tsx');
  });
});
