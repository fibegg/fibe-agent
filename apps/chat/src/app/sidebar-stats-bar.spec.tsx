import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SidebarStatsBar } from './sidebar-stats-bar';
import type { StoryEntry } from './agent-thinking-utils';

const emptyStats = { totalActions: 0, completed: 0, processing: 0, sessionTimeMs: 0 };
const filledStats = { totalActions: 10, completed: 8, processing: 1, sessionTimeMs: 5000 };
const brainClasses = { brain: 'text-violet-400', accent: 'text-violet-300' };

describe('SidebarStatsBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function renderBar(overrides: Partial<React.ComponentProps<typeof SidebarStatsBar>> = {}) {
    return render(
      <SidebarStatsBar
        sessionStats={filledStats}
        brainClasses={brainClasses}
        isStreaming={false}
        downloadAnimating={false}
        onRunCopy={vi.fn()}
        sessionTokenUsage={null}
        fullStoryItems={[] as StoryEntry[]}
        {...overrides}
      />
    );
  }

  it('renders the activity button', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /activity/i, hidden: true })).toBeTruthy();
  });

  it('shows empty state message when all stats are zero', () => {
    renderBar({ sessionStats: emptyStats });
    expect(screen.getByText(/not the droids/i)).toBeTruthy();
  });

  it('does not show empty message when stats are non-zero', () => {
    renderBar({ sessionStats: filledStats });
    expect(screen.queryByText(/not the droids/i)).toBeNull();
  });

  it('shows stat counts when non-zero stats provided', () => {
    renderBar({ sessionStats: filledStats });
    // CountUpNumber renders the value; check for the stat wrapper
    expect(screen.getAllByRole('tooltip').length).toBeGreaterThanOrEqual(3);
  });

  it('shows token usage when sessionTokenUsage is provided', () => {
    renderBar({ sessionTokenUsage: { inputTokens: 1000, outputTokens: 500 } });
    expect(screen.getByTitle('Token usage (input / output)')).toBeTruthy();
  });

  it('does not show token usage when null', () => {
    renderBar({ sessionTokenUsage: null });
    expect(screen.queryByTitle('Token usage (input / output)')).toBeNull();
  });

  it('shows Brain icon when not animating', () => {
    const { container } = renderBar({ downloadAnimating: false });
    // The Brain svg icon is present but no brain-download-anim class
    expect(container.querySelector('.brain-download-anim')).toBeNull();
  });

  it('shows animated brain icon when downloadAnimating', () => {
    const { container } = renderBar({ downloadAnimating: true });
    expect(container.querySelector('.brain-download-anim')).toBeTruthy();
  });

  it('disables the copy button when downloadAnimating', () => {
    renderBar({ downloadAnimating: true });
    const btn = screen.getByRole('button', { name: /activity/i, hidden: true });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows Loader2 when streaming', () => {
    const { container } = renderBar({ isStreaming: true });
    const loader = container.querySelector('.animate-spin');
    expect(loader).toBeTruthy();
  });

  it('shows Sparkles when not streaming', () => {
    const { container } = renderBar({ isStreaming: false });
    const sparkles = container.querySelector('.animate-pulse');
    expect(sparkles).toBeTruthy();
  });

  it('calls onRunCopy and shows "Copied to clipboard" after click', () => {
    const onRunCopy = vi.fn();
    renderBar({ onRunCopy });

    // Mock getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 200, top: 50, bottom: 80, width: 100, height: 30, x: 100, y: 50, toJSON: () => ({}),
    });

    const btn = screen.getByRole('button', { name: /activity/i, hidden: true });
    fireEvent.click(btn);
    expect(onRunCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Copied to clipboard')).toBeTruthy();
  });

  it('hides "Copied to clipboard" after 2500ms', () => {
    const onRunCopy = vi.fn();
    renderBar({ onRunCopy });

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 100, top: 0, bottom: 30, width: 100, height: 30, x: 0, y: 0, toJSON: () => ({}),
    });

    const btn = screen.getByRole('button', { name: /activity/i, hidden: true });
    fireEvent.click(btn);
    expect(screen.getByText('Copied to clipboard')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByText('Copied to clipboard')).toBeNull();
  });
});
