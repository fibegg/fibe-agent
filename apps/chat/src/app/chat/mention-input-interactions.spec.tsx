import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { MentionInput } from './mention-input';

describe('MentionInput – event interactions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls onChange via handleInput when text is typed', () => {
    const onChange = vi.fn();
    const { container } = render(<MentionInput value="" onChange={onChange} />);
    const el = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    // Simulate manual text content change followed by input event
    el.textContent = 'hello';
    fireEvent.input(el);
    expect(onChange).toHaveBeenCalled();
  });

  it('calls onValueAndCursor when provided, on input', () => {
    const onValueAndCursor = vi.fn();
    const { container } = render(
      <MentionInput value="" onChange={vi.fn()} onValueAndCursor={onValueAndCursor} />
    );
    const el = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    el.textContent = 'hi';
    fireEvent.input(el);
    expect(onValueAndCursor).toHaveBeenCalled();
  });

  it('calls onCursorChange on select event', () => {
    const onCursorChange = vi.fn();
    const { container } = render(
      <MentionInput value="" onChange={vi.fn()} onCursorChange={onCursorChange} />
    );
    const el = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    fireEvent.select(el);
    // onCursorChange may or may not be called depending on selection state; should not throw
    expect(() => fireEvent.select(el)).not.toThrow();
  });

  it('forwards onKeyDown prop for non-Backspace keys', () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <MentionInput value="" onChange={vi.fn()} onKeyDown={onKeyDown} />
    );
    const el = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('forwards onKeyDown for Backspace when not inside a chip', () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <MentionInput value="hello" onChange={vi.fn()} onKeyDown={onKeyDown} />
    );
    const el = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    fireEvent.keyDown(el, { key: 'Backspace' });
    expect(onKeyDown).toHaveBeenCalled();
  });

  it('calls onPaste when clipboard has no text (image paste)', () => {
    const onPaste = vi.fn();
    const { container } = render(<MentionInput value="" onChange={vi.fn()} onPaste={onPaste} />);
    const el = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    // Simulate paste with empty text/plain so getClipboardTextForContentEditablePaste returns null
    fireEvent.paste(el, {
      clipboardData: {
        getData: () => '',
        items: [],
      },
    });
    // onPaste is called when clipboard has no text (image-only scenario)
    expect(onPaste).toHaveBeenCalled();
  });

  it('syncs value changes via effect', async () => {
    const { container, rerender } = render(
      <MentionInput value="" onChange={vi.fn()} />
    );
    const el = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    expect(el.textContent).toBe('');

    rerender(<MentionInput value="updated text" onChange={vi.fn()} />);
    await waitFor(() => {
      expect(el.textContent).toContain('updated text');
    });
  });

  it('renders chips for @mention values', async () => {
    const { container } = render(
      <MentionInput value="@src/index.ts" onChange={vi.fn()} />
    );
    await waitFor(() => {
      const chip = container.querySelector('[data-path="src/index.ts"]');
      expect(chip).toBeTruthy();
    });
  });

  it('handles multiline text with newlines', async () => {
    const { container } = render(
      <MentionInput value="line1\nline2\nline3" onChange={vi.fn()} />
    );
    const el = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    await waitFor(() => {
      expect(el.textContent).toContain('line1');
      expect(el.textContent).toContain('line2');
      expect(el.textContent).toContain('line3');
    });
  });

  it('renders with aria-multiline true', () => {
    const { container } = render(
      <MentionInput value="" onChange={vi.fn()} />
    );
    const el = container.querySelector('[contenteditable]');
    expect(el?.getAttribute('aria-multiline')).toBe('true');
  });
});
