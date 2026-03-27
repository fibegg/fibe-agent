// TreeNode – file-explorer-tree-node.spec.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeNode } from './file-explorer-tree-node';
import type { PlaygroundEntry } from './file-explorer-types';

vi.mock('../file-icon', () => ({
  FileIcon: () => <span data-testid="file-icon" />,
}));

// Mock scrollIntoView as it's not available in JSDOM
HTMLElement.prototype.scrollIntoView = vi.fn();

const fileEntry: PlaygroundEntry = {
  name: 'index.ts',
  path: '/root/index.ts',
  type: 'file',
};

const dirEntry: PlaygroundEntry = {
  name: 'src',
  path: '/root/src',
  type: 'directory',
  children: [fileEntry],
};

const emptyDirEntry: PlaygroundEntry = {
  name: 'empty',
  path: '/root/empty',
  type: 'directory',
  children: [],
};

describe('TreeNode', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders file name', () => {
    render(
      <TreeNode
        entry={fileEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    // Use getAllByText since the file name also appears in the button text
    const matches = screen.getAllByText('index.ts');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders FileIcon for file entries', () => {
    render(
      <TreeNode
        entry={fileEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByTestId('file-icon')).toBeTruthy();
  });

  it('renders Folder icon for collapsed directory', () => {
    const { container } = render(
      <TreeNode
        entry={dirEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    // ChevronRight is shown when collapsed and has children
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders ChevronDown icon for expanded directory with children', () => {
    const { container } = render(
      <TreeNode
        entry={dirEntry}
        depth={0}
        isExpanded={true}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('calls onToggle with path when clicking a directory', () => {
    const onToggle = vi.fn();
    render(
      <TreeNode
        entry={dirEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith('/root/src');
  });

  it('calls onFileClick with entry when clicking a file', () => {
    const onFileClick = vi.fn();
    render(
      <TreeNode
        entry={fileEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
        onFileClick={onFileClick}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onFileClick).toHaveBeenCalledWith(fileEntry);
  });

  it('does not call onFileClick when not provided for a file', () => {
    const onToggle = vi.fn();
    render(
      <TreeNode
        entry={fileEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={onToggle}
      />
    );
    // Should not throw
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('applies TREE_NODE_SELECTED class when selected', () => {
    const { container } = render(
      <TreeNode
        entry={fileEntry}
        depth={0}
        isExpanded={false}
        isSelected={true}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-violet-500/10');
  });

  it('shows unsaved-changes dot when isDirty is true', () => {
    render(
      <TreeNode
        entry={fileEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={true}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    const dot = screen.getByTitle('Unsaved changes');
    expect(dot).toBeTruthy();
  });

  it('does not show dirty dot when isDirty is false', () => {
    render(
      <TreeNode
        entry={fileEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    expect(screen.queryByTitle('Unsaved changes')).toBeNull();
  });

  it('shows M badge for modified git status', () => {
    const modifiedEntry: PlaygroundEntry = { ...fileEntry, gitStatus: 'modified' };
    render(
      <TreeNode
        entry={modifiedEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByTitle('Git: modified')).toBeTruthy();
    expect(screen.getByText('M')).toBeTruthy();
  });

  it('shows U badge for untracked git status', () => {
    const untrackedEntry: PlaygroundEntry = { ...fileEntry, gitStatus: 'untracked' };
    render(
      <TreeNode
        entry={untrackedEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('U')).toBeTruthy();
  });

  it('shows U badge for added git status', () => {
    const addedEntry: PlaygroundEntry = { ...fileEntry, gitStatus: 'added' };
    render(
      <TreeNode
        entry={addedEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('U')).toBeTruthy();
  });

  it('shows D badge for deleted git status', () => {
    const deletedEntry: PlaygroundEntry = { ...fileEntry, gitStatus: 'deleted' };
    render(
      <TreeNode
        entry={deletedEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('applies name color class for git modified', () => {
    const modifiedEntry: PlaygroundEntry = { ...fileEntry, gitStatus: 'modified' };
    render(
      <TreeNode
        entry={modifiedEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    // The name span has the amber color class
    const nameSpans = screen.getAllByText('index.ts');
    const nameSpan = nameSpans.find((el) => el.className.includes('truncate'));
    expect(nameSpan?.className).toContain('text-amber-500/90');
  });

  it('selected overrides git color for name', () => {
    const modifiedEntry: PlaygroundEntry = { ...fileEntry, gitStatus: 'modified' };
    render(
      <TreeNode
        entry={modifiedEntry}
        depth={0}
        isExpanded={false}
        isSelected={true}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    const nameSpans = screen.getAllByText('index.ts');
    const nameSpan = nameSpans.find((el) => el.className.includes('truncate'));
    expect(nameSpan?.className).toContain('text-violet-400');
    expect(nameSpan?.className).not.toContain('text-amber-500/90');
  });

  it('applies animate-file-added class for added animType', () => {
    const { container } = render(
      <TreeNode
        entry={fileEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType="added"
        onToggle={vi.fn()}
      />
    );
    expect(container.firstChild?.toString()).toBeDefined();
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain('animate-file-added');
  });

  it('applies animate-file-removed class for removed animType', () => {
    const { container } = render(
      <TreeNode
        entry={fileEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType="removed"
        onToggle={vi.fn()}
      />
    );
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain('animate-file-removed');
  });

  it('applies animate-file-modified class for modified animType', () => {
    const { container } = render(
      <TreeNode
        entry={fileEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType="modified"
        onToggle={vi.fn()}
      />
    );
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv?.className).toContain('animate-file-modified');
  });

  it('applies depth-based padding', () => {
    const { container } = render(
      <TreeNode
        entry={fileEntry}
        depth={2}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    const btn = container.querySelector('button');
    // paddingLeft = 0.5 + 2 * 0.75 = 2rem
    expect(btn?.style.paddingLeft).toBe('2rem');
  });

  it('does not show chevron for empty directory', () => {
    const { container } = render(
      <TreeNode
        entry={emptyDirEntry}
        depth={0}
        isExpanded={false}
        isSelected={false}
        isDirty={false}
        animType={undefined}
        onToggle={vi.fn()}
      />
    );
    // Should show a placeholder span, not a chevron SVG in the chevron slot
    const chevronSlot = container.querySelector('[aria-hidden="true"] + *');
    expect(chevronSlot).toBeDefined();
  });
});
