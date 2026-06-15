import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHAT_LAYOUT_HEIGHT, ChatLayout } from './chat-layout';

describe('ChatLayout', () => {
  it('uses the shared visual viewport height for mobile keyboard resizing', () => {
    const { container } = render(<ChatLayout>content</ChatLayout>);
    const root = container.firstElementChild as HTMLElement | null;

    expect(root).toBeTruthy();
    expect(CHAT_LAYOUT_HEIGHT).toBe('var(--app-visual-height, 100dvh)');
  });
});
