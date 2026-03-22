import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DragDropOverlay } from './drag-drop-overlay';

describe('DragDropOverlay', () => {
  it('renders "Drop files here" text', () => {
    render(<DragDropOverlay />);
    expect(screen.getByText('Drop files here')).toBeTruthy();
  });

  it('renders with aria-hidden attribute', () => {
    const { container } = render(<DragDropOverlay />);
    expect((container.firstChild as Element)?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders a div container', () => {
    const { container } = render(<DragDropOverlay />);
    expect(container.querySelector('div')).toBeTruthy();
  });
});
