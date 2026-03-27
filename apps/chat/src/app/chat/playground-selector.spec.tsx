import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaygroundSelector } from './playground-selector';
import type { BrowseEntry } from './use-playground-selector';

const asyncNoop = async () => true;

function renderSelector(overrides: Partial<Parameters<typeof PlaygroundSelector>[0]> = {}) {
  const defaults = {
    entries: [] as BrowseEntry[],
    loading: false,
    error: null as string | null,
    currentLink: null as string | null,
    linking: false,
    canGoBack: false,
    breadcrumbs: [] as string[],
    onOpen: vi.fn(),
    onBrowse: vi.fn(),
    onGoBack: vi.fn(),
    onGoToRoot: vi.fn(),
    onLink: vi.fn(asyncNoop),
    visible: true,
  };
  return render(<PlaygroundSelector {...defaults} {...overrides} />);
}

describe('PlaygroundSelector', () => {
  it('returns null when visible is false', () => {
    const { container } = renderSelector({ visible: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders trigger with "Select Playground" when no link is set', () => {
    renderSelector();
    expect(screen.getByRole('button', { name: 'Select playground' })).toBeTruthy();
    expect(screen.getByText('Select Playground')).toBeTruthy();
  });

  it('shows current link name in trigger', () => {
    renderSelector({ currentLink: 'playgrounds/myproject' });
    expect(screen.getByText('myproject')).toBeTruthy();
  });

  it('opens dropdown and calls onOpen when trigger is clicked', () => {
    const onOpen = vi.fn();
    renderSelector({ onOpen });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole('listbox', { name: 'Playground browser' })).toBeTruthy();
  });

  it('renders directory entries with browse navigation', () => {
    const onBrowse = vi.fn();
    const entries: BrowseEntry[] = [
      { name: 'project-a', path: 'project-a', type: 'directory' },
      { name: 'readme.md', path: 'readme.md', type: 'file' },
    ];
    renderSelector({ entries, onBrowse });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    const dirButton = screen.getByRole('option', { name: /project-a/ });
    expect(dirButton).toBeTruthy();
    fireEvent.click(dirButton);
    expect(onBrowse).toHaveBeenCalledWith('project-a');
  });

  it('renders back button when canGoBack is true', () => {
    const onGoBack = vi.fn();
    renderSelector({ canGoBack: true, onGoBack });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    const backBtn = screen.getByRole('button', { name: 'Go back' });
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn);
    expect(onGoBack).toHaveBeenCalledOnce();
  });

  it('does not render back button when canGoBack is false', () => {
    renderSelector({ canGoBack: false });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull();
  });

  it('renders root button and calls onGoToRoot', () => {
    const onGoToRoot = vi.fn();
    renderSelector({ onGoToRoot });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    const rootBtn = screen.getByRole('button', { name: 'Go to root' });
    fireEvent.click(rootBtn);
    expect(onGoToRoot).toHaveBeenCalledOnce();
  });

  it('displays breadcrumbs', () => {
    renderSelector({ breadcrumbs: ['playrooms', 'myproject'] });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    expect(screen.getByText('playrooms')).toBeTruthy();
    expect(screen.getByText('myproject')).toBeTruthy();
  });

  it('shows loading state', () => {
    renderSelector({ loading: true });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows error state', () => {
    renderSelector({ error: 'Something went wrong' });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('shows empty directory message', () => {
    renderSelector({ entries: [], loading: false, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    expect(screen.getByText('Empty directory')).toBeTruthy();
  });

  it('shows linked indicator for currently linked entry', () => {
    const entries: BrowseEntry[] = [
      { name: 'my-project', path: 'my-project', type: 'directory' },
    ];
    renderSelector({ entries, currentLink: 'my-project' });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    const option = screen.getByRole('option', { name: /my-project/ });
    expect(option.getAttribute('aria-selected')).toBe('true');
  });

  it('shows current link footer when a link is set', () => {
    renderSelector({ currentLink: 'playgrounds/myproject' });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    expect(screen.getByText(/Linked:/)).toBeTruthy();
    expect(screen.getByText('playgrounds/myproject')).toBeTruthy();
  });

  it('renders symlink entry as navigable and calls onBrowse on click', () => {
    const onBrowse = vi.fn();
    const entries: BrowseEntry[] = [
      { name: 'example-backend', path: 'playzones/example-backend', type: 'symlink' },
    ];
    renderSelector({ entries, onBrowse });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    const option = screen.getByRole('option', { name: /example-backend/ });
    expect(option).toBeTruthy();
    fireEvent.click(option);
    expect(onBrowse).toHaveBeenCalledWith('playzones/example-backend');
  });

  it('smart-cut: strips org prefix from trigger label (dash separator)', () => {
    renderSelector({ currentLink: 'playzones/example-backend' });
    // Should show 'backend', not 'example-backend'
    expect(screen.getByText('backend')).toBeTruthy();
    expect(screen.queryByText('example-backend')).toBeNull();
  });

  it('smart-cut: shows full name when no dash in segment', () => {
    renderSelector({ currentLink: 'playzones/myproject' });
    expect(screen.getByText('myproject')).toBeTruthy();
  });

  it('marks symlink entry as selected when it matches currentLink', () => {
    const entries: BrowseEntry[] = [
      { name: 'example-backend', path: 'playzones/example-backend', type: 'symlink' },
    ];
    renderSelector({ entries, currentLink: 'playzones/example-backend' });
    fireEvent.click(screen.getByRole('button', { name: 'Select playground' }));
    const option = screen.getByRole('option', { name: /example-backend/ });
    expect(option.getAttribute('aria-selected')).toBe('true');
  });
});
