import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnimatedPhoenixLogo } from './animated-phoenix-logo';

describe('AnimatedPhoenixLogo', () => {
  it('renders the phoenix logo image', () => {
    render(<AnimatedPhoenixLogo />);
    expect(screen.getByRole('img', { name: 'Phoenix Logo' })).toBeTruthy();
  });

  it('sets img src to /phoenix.png', () => {
    render(<AnimatedPhoenixLogo />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('/phoenix.png');
  });

  it('sets img alt to Phoenix Logo', () => {
    render(<AnimatedPhoenixLogo />);
    expect(screen.getByRole('img').getAttribute('alt')).toBe('Phoenix Logo');
  });

  it('applies custom className to wrapper', () => {
    const { container } = render(<AnimatedPhoenixLogo className="size-8" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('size-8');
  });

  it('applies idle scale class when not hovered', () => {
    render(<AnimatedPhoenixLogo />);
    const img = screen.getByRole('img');
    expect(img.className).toContain('scale-100');
  });

  it('applies hover scale and rotate when hovered', () => {
    render(<AnimatedPhoenixLogo />);
    const wrapper = screen.getByRole('img').parentElement?.parentElement;
    expect(wrapper).toBeTruthy();
    fireEvent.mouseEnter(wrapper as HTMLElement);
    const img = screen.getByRole('img');
    expect(img.className).toContain('scale-125');
    expect(img.className).toContain('rotate-12');
  });

  it('renders explode particles when hovered', () => {
    const { container } = render(<AnimatedPhoenixLogo />);
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    const explodeParticles = container.querySelectorAll('.animate-explode');
    expect(explodeParticles.length).toBe(12);
  });

  it('removes hover state on mouse leave', () => {
    render(<AnimatedPhoenixLogo />);
    const wrapper = screen.getByRole('img').parentElement?.parentElement;
    expect(wrapper).toBeTruthy();
    fireEvent.mouseEnter(wrapper as HTMLElement);
    fireEvent.mouseLeave(wrapper as HTMLElement);
    const img = screen.getByRole('img');
    expect(img.className).toContain('scale-100');
  });
});
