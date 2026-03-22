import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileExplorerTabs } from './file-explorer-tabs';
import type { FileTab } from './file-explorer-tabs';

describe('FileExplorerTabs', () => {
  it('renders both tabs', () => {
    render(
      <FileExplorerTabs
        activeTab="playground"
        onTabChange={vi.fn()}
      />
    );
    expect(screen.getByText('Playground')).toBeTruthy();
    expect(screen.getByText('AI')).toBeTruthy();
  });

  it('marks active tab with aria-selected=true', () => {
    render(
      <FileExplorerTabs
        activeTab="playground"
        onTabChange={vi.fn()}
      />
    );
    const tabs = screen.getAllByRole('tab');
    const playgroundTab = tabs.find(t => t.textContent?.includes('Playground'));
    const aiTab = tabs.find(t => t.textContent?.includes('AI'));
    expect(playgroundTab?.getAttribute('aria-selected')).toBe('true');
    expect(aiTab?.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onTabChange with correct tab id when tab is clicked', () => {
    const onTabChange = vi.fn();
    render(
      <FileExplorerTabs
        activeTab="playground"
        onTabChange={onTabChange}
      />
    );
    const tabs = screen.getAllByRole('tab');
    const aiTab = tabs.find(t => t.textContent?.includes('AI'));
    if (aiTab) fireEvent.click(aiTab);
    expect(onTabChange).toHaveBeenCalledWith('agent' as FileTab);
  });

  it('shows stats for playground tab when playgroundStats provided', () => {
    render(
      <FileExplorerTabs
        activeTab="playground"
        onTabChange={vi.fn()}
        playgroundStats={{ fileCount: 10, totalLines: 500 }}
      />
    );
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('does not show stats when fileCount is 0', () => {
    const { container } = render(
      <FileExplorerTabs
        activeTab="playground"
        onTabChange={vi.fn()}
        playgroundStats={{ fileCount: 0, totalLines: 0 }}
      />
    );
    // Count spans (only icon + label, no stats)
    const spans = container.querySelectorAll('span');
    // No tabular-nums span should be present
    const hasStats = Array.from(spans).some(s => s.className.includes('tabular-nums'));
    expect(hasStats).toBe(false);
  });

  it('shows stats for agent tab when agentStats provided and ai is active', () => {
    render(
      <FileExplorerTabs
        activeTab="agent"
        onTabChange={vi.fn()}
        agentStats={{ fileCount: 5, totalLines: 200 }}
      />
    );
    expect(screen.getByText('5')).toBeTruthy();
  });
});
