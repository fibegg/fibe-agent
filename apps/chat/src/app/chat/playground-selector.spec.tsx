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
  it('strips the org prefix before the first dash', () => {
    expect(smartCutLabel('orgs/example-backend')).toBe('backend');
  });

  it('returns the full segment when there is no dash', () => {
    expect(smartCutLabel('playzones/myproject')).toBe('myproject');
  });

  it('handles a path with no slashes (bare segment)', () => {
    expect(smartCutLabel('example-frontend')).toBe('frontend');
  });

  it('falls back to "Playground" for an empty string', () => {
    expect(smartCutLabel('')).toBe('Playground');
  });

  it('handles trailing slash gracefully', () => {
    // last non-empty segment picked via filter(Boolean)
    expect(smartCutLabel('orgs/example-backend/')).toBe('backend');
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
      { name: 'project-a', path: 'project-a', type: 'directory' },
      { name: 'readme.md', path: 'readme.md', type: 'file' },
    ];
    renderSelector({ entries, onLink });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    
    const entryButton = screen.getByRole('option', { name: /project-a/ });
    expect(entryButton).toBeTruthy();
    fireEvent.click(entryButton);
    
    expect(onLink).toHaveBeenCalledWith('project-a');
    
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
    renderSelector({ currentLink: 'playgrounds/myproject' });
    fireEvent.click(screen.getByRole('button', { name: 'Link Playground' }));
    expect(screen.getByText(/Linked:/)).toBeTruthy();
    expect(screen.getByText('playgrounds/myproject')).toBeTruthy();
  });
});
