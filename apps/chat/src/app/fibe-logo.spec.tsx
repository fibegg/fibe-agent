import { render, screen } from '@testing-library/react';
import { FibeLogo } from './fibe-logo';

describe('FibeLogo', () => {
  it('renders an accessible img role by default (wordmark)', () => {
    render(<FibeLogo />);
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('has aria-label "fibe"', () => {
    render(<FibeLogo />);
    expect(screen.getByRole('img', { name: 'fibe' })).toBeTruthy();
  });

  it('renders wordmark as a span (not SVG) for perfect font alignment', () => {
    const { container } = render(<FibeLogo />);
    const span = container.querySelector('span[role="img"]');
    expect(span).toBeTruthy();
    expect(span!.textContent).toContain('f');
    expect(span!.textContent).toContain('be');
  });

  it('renders icon variant as SVG', () => {
    const { container } = render(<FibeLogo variant="icon" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 32 32');
  });

  it('applies custom className', () => {
    render(<FibeLogo className="w-32 text-white" />);
    const el = screen.getByRole('img');
    expect(el.className).toContain('w-32');
  });

  it('applies empty className by default', () => {
    render(<FibeLogo />);
    expect(screen.getByRole('img').className).toBe('');
  });

  it('contains the glowing pulse dot', () => {
    const { container } = render(<FibeLogo />);
    // The pulse is a span with radial-gradient background
    const spans = container.querySelectorAll('span');
    const pulse = Array.from(spans).find(
      (s) => (s as HTMLElement).style.borderRadius === '50%'
    );
    expect(pulse).toBeTruthy();
  });

  it('icon variant contains the glowing pulse gradient', () => {
    const { container } = render(<FibeLogo variant="icon" />);
    expect(container.querySelector('radialGradient')).toBeTruthy();
    expect(container.querySelector('circle')).toBeTruthy();
  });
});
