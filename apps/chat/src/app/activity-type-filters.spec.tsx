import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityTypeFilters } from './activity-type-filters';
import { ACTIVITY_TYPE_FILTERS } from './activity-review-utils';

describe('ActivityTypeFilters', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders an "All" button', () => {
    render(<ActivityTypeFilters typeFilter={[]} onTypeFilterChange={vi.fn()} />);
    expect(screen.getByText('All')).toBeTruthy();
  });

  it('renders a button for each ACTIVITY_TYPE_FILTERS key', () => {
    render(<ActivityTypeFilters typeFilter={[]} onTypeFilterChange={vi.fn()} />);
    // Verify at minimum that type filter buttons are rendered (one per filter key)
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(ACTIVITY_TYPE_FILTERS.length + 1);
  });

  it('"All" button is active (highlighted) when typeFilter is empty', () => {
    render(<ActivityTypeFilters typeFilter={[]} onTypeFilterChange={vi.fn()} />);
    const allBtn = screen.getByText('All');
    expect(allBtn.className).toContain('bg-violet-500/20');
  });

  it('"All" button is inactive when typeFilter has entries', () => {
    render(<ActivityTypeFilters typeFilter={['tool_call']} onTypeFilterChange={vi.fn()} />);
    const allBtn = screen.getByText('All');
    expect(allBtn.className).not.toContain('bg-violet-500/20');
  });

  it('clicking "All" calls onTypeFilterChange with empty array', () => {
    const onTypeFilterChange = vi.fn();
    render(<ActivityTypeFilters typeFilter={['tool_call']} onTypeFilterChange={onTypeFilterChange} />);
    fireEvent.click(screen.getByText('All'));
    expect(onTypeFilterChange).toHaveBeenCalledWith([]);
  });

  it('clicking a filter button that is inactive adds it to the filter', () => {
    const onTypeFilterChange = vi.fn();
    render(<ActivityTypeFilters typeFilter={[]} onTypeFilterChange={onTypeFilterChange} />);
    // Click the first filter type
    const firstFilterKey = ACTIVITY_TYPE_FILTERS[0];
    // Find buttons beyond the "All" button
    const buttons = screen.getAllByRole('button');
    // buttons[0] = All, buttons[1..n] = type filters
    fireEvent.click(buttons[1]);
    expect(onTypeFilterChange).toHaveBeenCalledWith([firstFilterKey]);
  });

  it('clicking a filter button that is active removes it from the filter', () => {
    const onTypeFilterChange = vi.fn();
    const firstFilterKey = ACTIVITY_TYPE_FILTERS[0];
    render(<ActivityTypeFilters typeFilter={[firstFilterKey]} onTypeFilterChange={onTypeFilterChange} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);
    expect(onTypeFilterChange).toHaveBeenCalledWith([]);
  });

  it('multiple active filters: clicking one removes only that one', () => {
    const onTypeFilterChange = vi.fn();
    const [first, second] = ACTIVITY_TYPE_FILTERS;
    render(<ActivityTypeFilters typeFilter={[first, second]} onTypeFilterChange={onTypeFilterChange} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);
    expect(onTypeFilterChange).toHaveBeenCalledWith([second]);
  });
});
