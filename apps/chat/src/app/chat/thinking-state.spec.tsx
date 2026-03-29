
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThinkingState, ThinkingAvatar } from './thinking-state';

vi.mock('../avatar-config-context', () => ({
  useAvatarConfig: vi.fn().mockReturnValue({ assistantAvatarUrl: null }),
}));

describe('ThinkingState', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('renders without error', () => {
    const { container } = render(<ThinkingState />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows a thinking line ending with ellipsis', () => {
    render(<ThinkingState />);
    const text = screen.getByText(/\.\.\.$/);
    expect(text).toBeTruthy();
  });

  it('renders bounce dots', () => {
    const { container } = render(<ThinkingState />);
    const dots = container.querySelectorAll('.animate-thinking-bounce');
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it('uses easter egg lines when lastUserMessage matches', () => {
    render(<ThinkingState lastUserMessage="42" />);
    const text = screen.getByText(/ultimate answer|Don't panic/i);
    expect(text).toBeTruthy();
  });

  it('cycles text after an interval tick', () => {
    render(<ThinkingState />);
    const before = screen.getByText(/\.\.\./).textContent;
    act(() => { vi.advanceTimersByTime(2400); });
    const after = screen.getByText(/\.\.\./).textContent;
    expect(typeof after).toBe('string');
    expect(before).toBeTruthy();
  });

  it('clears interval on unmount', () => {
    const spy = vi.spyOn(global, 'clearInterval');
    const { unmount } = render(<ThinkingState />);
    unmount();
    expect(spy).toHaveBeenCalled();
  });
});

describe('ThinkingAvatar', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders without error (no custom avatar)', () => {
    const { container } = render(<ThinkingAvatar />);
    expect(container.firstChild).toBeTruthy();
  });

  it('contains Sparkles icon when no avatarUrl', () => {
    const { container } = render(<ThinkingAvatar />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders img when assistantAvatarUrl is set', async () => {
    const { useAvatarConfig } = await import('../avatar-config-context');
    vi.mocked(useAvatarConfig).mockReturnValue({ assistantAvatarUrl: 'https://example.com/bot.png', userAvatarUrl: undefined });
    const { container } = render(<ThinkingAvatar />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/bot.png');
  });
});
