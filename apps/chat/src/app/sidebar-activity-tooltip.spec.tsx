import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarActivityTooltip } from './sidebar-activity-tooltip';

describe('SidebarActivityTooltip', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when tooltip is null', () => {
    const { container } = render(<SidebarActivityTooltip tooltip={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a tooltip with given content', () => {
    const tooltip = {
      rect: { left: 100, top: 200, height: 40 },
      content: 'Hello world',
      variant: 'default',
    };
    render(<SidebarActivityTooltip tooltip={tooltip} />);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('applies reasoning class for reasoning variant', () => {
    const tooltip = {
      rect: { left: 0, top: 0, height: 0 },
      content: 'Reasoning text',
      variant: 'reasoning',
    };
    render(<SidebarActivityTooltip tooltip={tooltip} />);
    const el = screen.getByRole('tooltip');
    expect(el.className).toContain('min-w-[360px]');
    expect(el.className).toContain('max-w-[720px]');
    expect(el.className).toContain('whitespace-normal');
  });

  it('applies non-reasoning class for other variants', () => {
    const tooltip = {
      rect: { left: 0, top: 0, height: 0 },
      content: 'Tool call detail',
      variant: 'tool_call',
    };
    render(<SidebarActivityTooltip tooltip={tooltip} />);
    const el = screen.getByRole('tooltip');
    expect(el.className).toContain('whitespace-pre-line');
    expect(el.className).toContain('min-w-[320px]');
  });

  it('positions the tooltip using rect values', () => {
    const tooltip = {
      rect: { left: 50, top: 100, height: 30 },
      content: 'Positioned',
      variant: 'default',
    };
    render(<SidebarActivityTooltip tooltip={tooltip} />);
    const el = screen.getByRole('tooltip');
    const style = (el as HTMLElement).style;
    // left should be rect.left - 8 = 42
    expect(style.left).toBe('42px');
    // top should be rect.top + rect.height / 2 = 115
    expect(style.top).toBe('115px');
  });
});
