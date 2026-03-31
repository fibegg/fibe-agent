import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelResizeHandle } from './panel-resize-handle';

describe('PanelResizeHandle', () => {
  it('renders with role separator and aria-orientation vertical', () => {
    render(
      <PanelResizeHandle side="left" onPointerDown={vi.fn()} />
    );
    const handle = screen.getByRole('separator');
    expect(handle).toBeDefined();
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('uses default aria-label for side=left', () => {
    render(<PanelResizeHandle side="left" onPointerDown={vi.fn()} />);
    expect(screen.getByLabelText('Resize left panel')).toBeDefined();
  });

  it('uses default aria-label for side=right', () => {
    render(<PanelResizeHandle side="right" onPointerDown={vi.fn()} />);
    expect(screen.getByLabelText('Resize right panel')).toBeDefined();
  });

  it('uses custom ariaLabel when provided', () => {
    render(
      <PanelResizeHandle side="left" onPointerDown={vi.fn()} ariaLabel="Custom label" />
    );
    expect(screen.getByLabelText('Custom label')).toBeDefined();
  });

  it('calls onPointerDown when pointer is pressed', () => {
    const onPointerDown = vi.fn();
    render(<PanelResizeHandle side="left" onPointerDown={onPointerDown} />);
    fireEvent.pointerDown(screen.getByRole('separator'));
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it('sets data-dragging attribute when isDragging=true', () => {
    render(
      <PanelResizeHandle side="left" isDragging onPointerDown={vi.fn()} />
    );
    const handle = screen.getByRole('separator');
    expect(handle.getAttribute('data-dragging')).toBe('true');
  });

  it('does not set data-dragging attribute when isDragging=false', () => {
    render(
      <PanelResizeHandle side="left" isDragging={false} onPointerDown={vi.fn()} />
    );
    const handle = screen.getByRole('separator');
    expect(handle.getAttribute('data-dragging')).toBeNull();
  });

  it('positions on right edge for side=left', () => {
    render(<PanelResizeHandle side="left" onPointerDown={vi.fn()} />);
    const handle = screen.getByRole('separator');
    expect((handle as HTMLElement).style.right).toBe('0px');
  });

  it('positions on left edge for side=right', () => {
    render(<PanelResizeHandle side="right" onPointerDown={vi.fn()} />);
    const handle = screen.getByRole('separator');
    expect((handle as HTMLElement).style.left).toBe('0px');
  });

  it('has col-resize cursor', () => {
    render(<PanelResizeHandle side="left" onPointerDown={vi.fn()} />);
    const handle = screen.getByRole('separator');
    expect((handle as HTMLElement).style.cursor).toBe('col-resize');
  });
});
