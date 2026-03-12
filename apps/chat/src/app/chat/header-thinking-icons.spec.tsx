import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HeaderThinkingIcons } from './header-thinking-icons';

describe('HeaderThinkingIcons', () => {
  it('renders without error', () => {
    const { container } = render(<HeaderThinkingIcons />);
    expect(container.firstChild).toBeTruthy();
  });

  it('has aria-hidden on root', () => {
    const { container } = render(<HeaderThinkingIcons />);
    const root = container.querySelector('[aria-hidden="true"]');
    expect(root).toBeTruthy();
  });

  it('renders flame element with animation class', () => {
    const { container } = render(<HeaderThinkingIcons />);
    const flame = container.querySelector('.animate-header-flame-out');
    expect(flame).toBeTruthy();
  });

  it('renders dust particles with animation class', () => {
    const { container } = render(<HeaderThinkingIcons />);
    const dust = container.querySelectorAll('.animate-header-dust');
    expect(dust.length).toBeGreaterThan(0);
  });
});
