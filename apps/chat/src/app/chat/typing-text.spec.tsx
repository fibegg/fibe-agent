import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypingText } from './typing-text';

describe('TypingText', () => {
  it('renders wrapper with no visible text when text is empty and skipAnimation', () => {
    const { container } = render(<TypingText text="" skipAnimation />);
    const outer = container.querySelector('span');
    expect(outer).toBeTruthy();
    expect(outer?.textContent?.trim()).toBe('');
  });

  it('shows full text immediately when skipAnimation is true', () => {
    render(<TypingText text="hello" skipAnimation />);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('renders cursor when showCursor is true', () => {
    const { container } = render(<TypingText text="x" skipAnimation showCursor />);
    const cursor = container.querySelector('.animate-typing-cursor');
    expect(cursor).toBeTruthy();
  });

  it('does not render cursor when showCursor is false', () => {
    const { container } = render(<TypingText text="x" skipAnimation showCursor={false} />);
    const cursor = container.querySelector('.animate-typing-cursor');
    expect(cursor).toBeFalsy();
  });

  it('applies className to wrapper span', () => {
    const { container } = render(<TypingText text="x" skipAnimation className="custom" />);
    const span = container.querySelector('span.custom');
    expect(span).toBeTruthy();
  });
});
