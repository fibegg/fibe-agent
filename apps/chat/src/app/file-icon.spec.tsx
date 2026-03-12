import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FileIcon } from './file-icon';

describe('FileIcon', () => {
  it('renders for file path with extension', () => {
    const { container } = render(<FileIcon pathOrName="src/app.ts" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders for directory when isDirectory is true', () => {
    const { container } = render(<FileIcon pathOrName="src/app.ts" isDirectory />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders for path without extension as folder', () => {
    const { container } = render(<FileIcon pathOrName="src/components" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('applies custom size via style', () => {
    const { container } = render(<FileIcon pathOrName="x.ts" size={16} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect((svg as SVGElement).style.width).toBe('16px');
    expect((svg as SVGElement).style.height).toBe('16px');
  });

  it('applies className', () => {
    const { container } = render(<FileIcon pathOrName="x.ts" className="opacity-90" />);
    expect(container.querySelector('[class*="opacity-90"]')).toBeTruthy();
  });

  it('renders for image extension', () => {
    const { container } = render(<FileIcon pathOrName="logo.png" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders for json extension', () => {
    const { container } = render(<FileIcon pathOrName="data.json" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders for unknown extension', () => {
    const { container } = render(<FileIcon pathOrName="file.xyz" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
