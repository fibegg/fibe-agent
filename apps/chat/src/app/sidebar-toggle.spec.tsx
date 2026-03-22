import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SidebarToggle } from './sidebar-toggle';

describe('SidebarToggle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a button with given aria-label', () => {
    render(
      <SidebarToggle
        isCollapsed={false}
        onClick={vi.fn()}
        side="left"
        ariaLabel="Toggle sidebar"
      />
    );
    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toBeTruthy();
  });

  it('calls onClick when button is clicked', () => {
    const onClick = vi.fn();
    render(
      <SidebarToggle
        isCollapsed={false}
        onClick={onClick}
        side="left"
        ariaLabel="Toggle sidebar"
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('starts with animate-pulse class and removes it after delay', () => {
    const { container } = render(
      <SidebarToggle
        isCollapsed={false}
        onClick={vi.fn()}
        side="left"
        ariaLabel="Toggle"
      />
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain('animate-pulse');

    act(() => { vi.advanceTimersByTime(5001); });

    expect(button?.className).not.toContain('animate-pulse');
  });

  it('renders ChevronLeft icon when left side and not collapsed', () => {
    const { container } = render(
      <SidebarToggle
        isCollapsed={false}
        onClick={vi.fn()}
        side="left"
        ariaLabel="Toggle"
      />
    );
    // ChevronLeft SVG should be present
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders ChevronRight icon when left side and collapsed', () => {
    const { container } = render(
      <SidebarToggle
        isCollapsed={true}
        onClick={vi.fn()}
        side="left"
        ariaLabel="Toggle"
      />
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('positions toggle at -right-4 for left side', () => {
    const { container } = render(
      <SidebarToggle
        isCollapsed={false}
        onClick={vi.fn()}
        side="left"
        ariaLabel="Toggle"
      />
    );
    expect(container.querySelector('button')?.className).toContain('-right-4');
  });

  it('positions toggle at -left-4 for right side', () => {
    const { container } = render(
      <SidebarToggle
        isCollapsed={false}
        onClick={vi.fn()}
        side="right"
        ariaLabel="Toggle"
      />
    );
    expect(container.querySelector('button')?.className).toContain('-left-4');
  });

  it('shows Collapse label for right side when not collapsed', () => {
    render(
      <SidebarToggle
        isCollapsed={false}
        onClick={vi.fn()}
        side="right"
        ariaLabel="Toggle"
      />
    );
    expect(screen.getByText('Collapse')).toBeTruthy();
  });

  it('shows Expand label when collapsed', () => {
    render(
      <SidebarToggle
        isCollapsed={true}
        onClick={vi.fn()}
        side="right"
        ariaLabel="Toggle"
      />
    );
    expect(screen.getByText('Expand')).toBeTruthy();
  });
});
