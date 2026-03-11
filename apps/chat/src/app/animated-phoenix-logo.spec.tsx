import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimatedPhoenixLogo } from './animated-phoenix-logo';

describe('AnimatedPhoenixLogo', () => {
  it('renders the phoenix logo image', () => {
    render(<AnimatedPhoenixLogo />);
    const img = screen.getByRole('img', { name: 'Phoenix Logo' });
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('/phoenix.png');
  });

  it('applies custom className', () => {
    const { container } = render(<AnimatedPhoenixLogo className="size-8" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('size-8');
  });
});
