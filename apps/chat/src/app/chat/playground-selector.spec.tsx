import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaygroundSelector, smartCutLabel } from './playground-selector';
import type { BrowseEntry } from './use-playground-selector';

const asyncNoop = async () => true;

function renderSelector(overrides: Partial<Parameters<typeof PlaygroundSelector>[0]> = {}) {
  const defaults = {
    entries: [] as BrowseEntry[],
    loading: false,
    error: null as string | null,
    currentLink: null as string | null,
    linking: false,
    onOpen: vi.fn(),
    onLink: vi.fn(asyncNoop),
    visible: true,
  };
  return render(<PlaygroundSelector {...defaults} {...overrides} />);
}

// ─── smartCutLabel unit tests ────────────────────────────────────────────────

describe('smartCutLabel', () => {
  it('strips a trailing playground numeric suffix', () => {
    expect(smartCutLabel('alice--10')).toBe('alice');
    expect(smartCutLabel('playgrounds/bob--11')).toBe('bob');
  });

  it('returns the full segment when there is no trailing playground suffix', () => {
    expect(smartCutLabel('playzones/myproject')).toBe('myproject');
  });

  it('does not strip ordinary dashed names', () => {
    expect(smartCutLabel('example-frontend')).toBe('example-frontend');
  });

  it('falls back to "Playground" for an empty string', () => {
    expect(smartCutLabel('')).toBe('Playground');
  });

  it('handles trailing slash gracefully', () => {
    // last non-empty segment picked via filter(Boolean)
    expect(smartCutLabel('playgrounds/alice--10/')).toBe('alice');
  });
});

// ─── PlaygroundSelector component tests ─────────────────────────────────────

describe('PlaygroundSelector', () => {
  it('returns null when visible is false', () => {
    const { container } = renderSelector({ visible: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders trigger button with accessible label', () => {
    renderSelector();
    expect(screen.getByRole('button', { name: 'Link Playground' })).toBeTruthy();
  });

  it('opens dropdown and calls onOpen when trigger is clicked', () => {
    const onOpen = vi.fn();
    renderSelector({ onOpen });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole('listbox', { name: 'Playground linker' })).toBeTruthy();
  });

  it('closes dropdown when trigger is clicked a second time', () => {
    renderSelector();
    const btn = screen.getByRole('button', { name: 'Link Playground' });
    fireEvent.click(btn);
    expect(screen.getByRole('listbox', { name: 'Playground linker' })).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders entries and calls onLink on click', async () => {
    const onLink = vi.fn().mockResolvedValue(true);
    const entries: BrowseEntry[] = [
      { name: 'project-a--42', path: 'project-a--42', type: 'directory' },
      { name: 'readme.md', path: 'readme.md', type: 'file' },
    ];
    renderSelector({ entries, onLink });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    
    const entryButton = screen.getByRole('option', { name: /project-a/ });
    expect(entryButton).toBeTruthy();
    expect(screen.queryByText('project-a--42')).toBeNull();
    fireEvent.click(entryButton);
    
    expect(onLink).toHaveBeenCalledWith('project-a--42');
    
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });

  it('shows loading state', () => {
    renderSelector({ loading: true });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows error state', () => {
    renderSelector({ error: 'Something went wrong' });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('shows empty directory message', () => {
    renderSelector({ entries: [], loading: false, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    expect(screen.getByText('No playgrounds available')).toBeTruthy();
  });

  it('shows linked indicator for currently linked entry', () => {
    const entries: BrowseEntry[] = [{ name: 'my-project', path: 'my-project', type: 'directory' }];
    renderSelector({ entries, currentLink: 'my-project' });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    const option = screen.getByRole('option', { name: /my-project/ });
    expect(option.getAttribute('aria-selected')).toBe('true');
  });

  it('shows current link footer when a link is set', () => {
    renderSelector({ currentLink: 'playgrounds/myproject--44' });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    expect(screen.getByText(/Linked:/)).toBeTruthy();
    expect(screen.getByText('myproject')).toBeTruthy();
    expect(screen.queryByText('playgrounds/myproject--44')).toBeNull();
  });

  it('renders unlink control for current link and calls onUnlink after confirmation', async () => {
    const onUnlink = vi.fn().mockResolvedValue(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSelector({ currentLink: 'my-project', onUnlink });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));

    await waitFor(() => {
      expect(onUnlink).toHaveBeenCalledOnce();
    });
    expect(confirm).toHaveBeenCalledWith('Unlink the current playground?');

    confirm.mockRestore();
  });

  it('does not render unlink control without a current link', () => {
    renderSelector({ onUnlink: vi.fn().mockResolvedValue(true) });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();
  });
});
