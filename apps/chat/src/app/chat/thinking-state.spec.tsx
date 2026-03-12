import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThinkingState, ThinkingAvatar } from './thinking-state';

describe('ThinkingState', () => {
  it('renders without error', () => {
    const { container } = render(<ThinkingState />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows a thinking line ending with ellipsis', () => {
    render(<ThinkingState />);
    const text = screen.getByText(/\.\.\.$/);
    expect(text).toBeTruthy();
  });

  it('renders bounce dots', () => {
    const { container } = render(<ThinkingState />);
    const dots = container.querySelectorAll('.animate-thinking-bounce');
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it('uses easter egg lines when lastUserMessage matches', () => {
    render(<ThinkingState lastUserMessage="phoenix" />);
    const text = screen.getByText(/phoenix|ashes|renewal|flame/i);
    expect(text).toBeTruthy();
  });
});

describe('ThinkingAvatar', () => {
  it('renders without error', () => {
    const { container } = render(<ThinkingAvatar />);
    expect(container.firstChild).toBeTruthy();
  });

  it('contains Sparkles icon', () => {
    const { container } = render(<ThinkingAvatar />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});
