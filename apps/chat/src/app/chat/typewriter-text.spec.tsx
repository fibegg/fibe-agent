import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypewriterText } from './typewriter-text';

describe('TypewriterText', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-ui-effects');
  });

  it('renders full text immediately when UI effects are disabled', () => {
    localStorage.setItem('chat-ui-effects-enabled', 'false');
    render(<TypewriterText text="hello" />);
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
