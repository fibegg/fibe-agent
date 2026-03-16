import { render, screen } from '@testing-library/react';
import { PhoenixLogo } from './phoenix-logo';

describe('PhoenixLogo', () => {
  it('renders an img element', () => {
    render(<PhoenixLogo />);
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('sets src to /phoenix.png', () => {
    render(<PhoenixLogo />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('/phoenix.png');
  });

  it('sets alt to Phoenix Logo', () => {
    render(<PhoenixLogo />);
    expect(screen.getByRole('img', { name: 'Phoenix Logo' })).toBeTruthy();
  });

  it('applies className', () => {
    render(<PhoenixLogo className="size-16" />);
    const img = screen.getByRole('img');
    expect(img.className).toBe('size-16');
  });

  it('applies empty className by default', () => {
    render(<PhoenixLogo />);
    expect(screen.getByRole('img').className).toBe('');
  });
});
