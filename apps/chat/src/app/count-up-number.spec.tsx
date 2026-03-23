import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { CountUpNumber } from './count-up-number';

describe('CountUpNumber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders initial value in raw format', () => {
    const { container } = render(<CountUpNumber value={42} format="raw" />);
    expect(container.textContent).toBe('42');
  });

  it('renders initial value in compact format (small number)', () => {
    const { container } = render(<CountUpNumber value={999} format="compact" />);
    expect(container.textContent).toBe('999');
  });

  it('renders compact format with k for thousands', () => {
    const { container } = render(<CountUpNumber value={1500} format="compact" />);
    expect(container.textContent).toBe('1.5k');
  });

  it('renders compact format with M for millions', () => {
    const { container } = render(<CountUpNumber value={1_500_000} format="compact" />);
    expect(container.textContent).toBe('1.5M');
  });

  it('renders compact format without decimal for exact thousands', () => {
    const { container } = render(<CountUpNumber value={2000} format="compact" />);
    expect(container.textContent).toBe('2k');
  });

  it('renders compact format without decimal for exact millions', () => {
    const { container } = render(<CountUpNumber value={3_000_000} format="compact" />);
    expect(container.textContent).toBe('3M');
  });

  it('defaults to compact format', () => {
    const { container } = render(<CountUpNumber value={1000} />);
    expect(container.textContent).toBe('1k');
  });

  it('applies className to span', () => {
    const { container } = render(<CountUpNumber value={5} className="my-class" />);
    expect(container.querySelector('.my-class')).not.toBeNull();
  });

  it('animates from old to new value when value changes', async () => {
    const { rerender, container } = render(<CountUpNumber value={0} format="raw" />);
    expect(container.textContent).toBe('0');

    act(() => {
      rerender(<CountUpNumber value={100} format="raw" />);
    });

    // Advance partway through animation
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Mid-animation, value should be between 0 and 100
    const mid = parseInt(container.textContent ?? '0', 10);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThanOrEqual(100);

    // Complete animation
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(container.textContent).toBe('100');
  });

  it('does not animate when value stays the same', async () => {
    const { rerender, container } = render(<CountUpNumber value={42} format="raw" />);
    rerender(<CountUpNumber value={42} format="raw" />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(container.textContent).toBe('42');
  });
});
