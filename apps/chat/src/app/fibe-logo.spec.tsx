import { render, screen } from '@testing-library/react';
import { FibeLogo } from './fibe-logo';

describe('FibeLogo', () => {
  it('renders an img element', () => {
    render(<FibeLogo />);
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('sets src to /fibe.png', () => {
    render(<FibeLogo />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('/fibe.png');
  });

  it('sets alt to Fibe Logo', () => {
    render(<FibeLogo />);
    expect(screen.getByRole('img', { name: 'Fibe Logo' })).toBeTruthy();
  });

  it('applies className', () => {
    render(<FibeLogo className="size-16" />);
    const img = screen.getByRole('img');
    expect(img.className).toBe('size-16');
  });

  it('applies empty className by default', () => {
    render(<FibeLogo />);
    expect(screen.getByRole('img').className).toBe('');
  });
});
