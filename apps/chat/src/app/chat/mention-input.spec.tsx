import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MentionInput } from './mention-input';

describe('MentionInput', () => {
  it('renders a textbox with the given placeholder', () => {
    render(
      <MentionInput value="" onChange={vi.fn()} placeholder="Ask me anything..." />
    );
    expect(screen.getByRole('textbox', { name: 'Ask me anything...' })).toBeTruthy();
  });

  it('uses 16px font on root so mobile browsers do not auto-zoom on focus', () => {
    const { container } = render(
      <MentionInput value="" onChange={vi.fn()} placeholder="Test" />
    );
    const el = container.querySelector('[contenteditable="true"]');
    expect(el).toBeTruthy();
    expect((el as HTMLElement).className).toContain('text-[16px]');
  });

  it('uses sm:text-sm for larger viewports', () => {
    const { container } = render(
      <MentionInput value="" onChange={vi.fn()} placeholder="Test" />
    );
    const el = container.querySelector('[contenteditable="true"]');
    expect((el as HTMLElement).className).toContain('sm:text-sm');
  });

  it('applies custom className', () => {
    const { container } = render(
      <MentionInput value="" onChange={vi.fn()} className="w-full bg-transparent" />
    );
    const el = container.querySelector('[contenteditable="true"]');
    expect((el as HTMLElement).className).toContain('w-full');
    expect((el as HTMLElement).className).toContain('bg-transparent');
  });

  it('sets contenteditable to false when disabled', () => {
    const { container } = render(
      <MentionInput value="" onChange={vi.fn()} disabled placeholder="Test" />
    );
    const el = container.querySelector('[contenteditable="false"]');
    expect(el).toBeTruthy();
  });

  it('renders with id when provided', () => {
    const { container } = render(
      <MentionInput value="" onChange={vi.fn()} id="chat-input" placeholder="Test" />
    );
    const el = container.querySelector('#chat-input');
    expect(el).toBeTruthy();
  });

  it('syncs value with newlines so both lines appear in DOM', async () => {
    const { container } = render(
      <MentionInput value="line1\nline2" onChange={vi.fn()} placeholder="Test" />
    );
    const el = container.querySelector('[contenteditable="true"]') as HTMLElement;
    expect(el).toBeTruthy();
    await waitFor(() => {
      expect(el.textContent).toContain('line1');
      expect(el.textContent).toContain('line2');
    });
  });
});
